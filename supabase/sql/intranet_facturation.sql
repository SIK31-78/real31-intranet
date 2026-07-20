-- Tables natives intranet : facturation des honoraires de syndic.
-- Vit dans le schema public de la base patron (decision : tables natives dans public).
-- Nommees intranet_* pour les distinguer des tables Prisma (PascalCase) de l'App A.
-- A executer une fois dans le SQL editor Supabase de la base cible.
--
-- Portage de la solution PowerApps MYTHEC_REAL31_Automation (audit :
-- mythec-refactor/powerapps/INVENTORY.md + MIGRATION_PLAN.md). Couvre la
-- facturation ponctuelle SYNDIC : depassement CS, suivi travaux, suivi sinistre,
-- pre-etat date, etat date, + la grille tarifaire annuelle.
--
-- Pas de FK vers public."Copropriete" (reference logique par copropriete_id,
-- comme intranet_jalons / intranet_supervision_items) pour ne rien imposer aux
-- tables de l'App A. Les FK entre tables intranet_* sont conservees.
-- RLS laissee off comme le reste de public ; le cloisonnement gestionnaire
-- viendra avec l'auth Entra ID.
--
-- Convention monetaire (cf. MIGRATION_PLAN.md #1/#3) : intranet_tarifs stocke des
-- montants TTC ; les lignes de facture portent un HT (= TTC / 1,2). Le calcul vit
-- dans src/lib/domain/facturation/, pas en base.

-- ============================================================================
-- Grille tarifaire annuelle par prestation (cabinet-wide, pas de copro).
-- Equivalent de la liste SharePoint « Tarifs ».
-- ============================================================================

create table if not exists public.intranet_tarifs (
  id                     uuid primary key default gen_random_uuid(),
  annee                  smallint not null check (annee between 2000 and 2100),
  identifiant_prestation text not null,                    -- ex 'TauxHoraire', 'PreEtatDate', 'DossierAssureur'
  libelle                text,
  montant_ttc            numeric(12,2) not null check (montant_ttc >= 0),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (annee, identifiant_prestation)
);

create index if not exists intranet_tarifs_prestation_idx
  on public.intranet_tarifs (identifiant_prestation, annee);

-- ============================================================================
-- Historique des contrats de gestion par copropriete.
-- Equivalent de « Suivi des contrats copro ». Un nouvel enregistrement est ouvert
-- a chaque AG. Les ecrans de facturation lisent le contrat le plus recent (par
-- debut_contrat) pour resoudre l'annee du bareme applicable.
-- ============================================================================

create table if not exists public.intranet_suivi_contrats (
  id                     uuid primary key default gen_random_uuid(),
  copropriete_id         text not null,                    -- ref logique vers public."Copropriete".id
  debut_contrat          date not null,                    -- contrats REAL31 : typiquement 01/07 -> 30/06
  honoraires_gestion_ttc numeric(12,2) check (honoraires_gestion_ttc is null or honoraires_gestion_ttc >= 0),
  forfait_postaux_ttc    numeric(12,2) check (forfait_postaux_ttc is null or forfait_postaux_ttc >= 0),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists intranet_suivi_contrats_copro_idx
  on public.intranet_suivi_contrats (copropriete_id, debut_contrat desc);

-- ============================================================================
-- Factures : une par prestation ponctuelle facturee. Equivalent de la liste
-- « Facturation ». Chaque ligne alimente un brouillon Pennylane.
--
-- Ameliore le legacy : le flow FacturationSyndic n'avait AUCUN suivi d'etat.
-- statut + pennylane_* tracent l'emission et les echecs.
-- ============================================================================

create table if not exists public.intranet_factures (
  id                   uuid primary key default gen_random_uuid(),
  copropriete_id       text not null,                      -- ref logique
  type_prestation      text not null check (type_prestation in (
                         'depassement_cs',
                         'suivi_travaux',
                         'suivi_sinistre',
                         'pre_etat_date',
                         'etat_date',
                         'depassement_ag'
                       )),
  categorie            text not null default 'SYNDIC',
  libelle              text not null,
  date_facture         date not null,
  date_prestation      date,
  statut               text not null default 'a_facturer'
                       check (statut in ('a_facturer','facturee','erreur')),
  pennylane_invoice_id text,                                -- id du brouillon Pennylane une fois cree
  pennylane_error      text,                                -- message du dernier echec d'emission
  details              jsonb,                               -- champs specifiques au type (dates sinistre, montant travaux HT...)
  cree_par             text,                                -- initiales (ex 'EL') tant qu'il n'y a pas d'auth
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists intranet_factures_copro_idx
  on public.intranet_factures (copropriete_id);
create index if not exists intranet_factures_statut_idx
  on public.intranet_factures (statut, created_at desc);

-- ============================================================================
-- Lignes de facture : 1..N par facture (une seule pour la plupart des
-- prestations, 1 a 4 pour le suivi de sinistre). Aligne sur les invoice_lines
-- Pennylane. Le total = somme des lignes (pas de total denormalise).
-- ============================================================================

create table if not exists public.intranet_facture_lignes (
  id               uuid primary key default gen_random_uuid(),
  facture_id       uuid not null references public.intranet_factures(id) on delete cascade,
  ordre            integer not null default 1 check (ordre > 0),
  description      text not null,
  quantite         numeric(10,2) not null default 1 check (quantite > 0),
  prix_unitaire_ht numeric(12,2) not null check (prix_unitaire_ht >= 0),
  taux_tva         numeric(4,3) not null default 0.200 check (taux_tva >= 0),
  created_at       timestamptz not null default now(),
  unique (facture_id, ordre)
);

create index if not exists intranet_facture_lignes_facture_idx
  on public.intranet_facture_lignes (facture_id);
