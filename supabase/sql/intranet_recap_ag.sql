-- Tables natives intranet : recap AG (compte-rendu post-assemblee generale).
-- Vit dans le schema public de la base patron (decision : tables natives dans public).
-- A executer une fois dans le SQL editor Supabase de la base cible.
--
-- Portage de « Historique des récap AG » (PowerApps) + du flow NotifComptable.
-- Le recap AG est une donnee saisie dans l'intranet apres l'AG (ne resynchronise
-- jamais vers eStale/Crypto). Traite comme une COUCHE AUTONOME, independante du
-- flux supervision-ag / conclureAg existant (decision Sekou, 2026-07-08).
--
-- Cle metier (copropriete_id, ag_date), coherente avec intranet_jalons et
-- intranet_supervision_items qui identifient deja une AG de cette maniere.
-- Pas de FK vers public."Copropriete" (reference logique). RLS laissee off.
--
-- Depend de intranet_facturation.sql (references vers intranet_suivi_contrats
-- et intranet_factures) : executer intranet_facturation.sql en premier.

-- ============================================================================
-- Recap AG : un compte-rendu par AG tenue.
-- ============================================================================

create table if not exists public.intranet_recap_ag (
  id                 uuid primary key default gen_random_uuid(),
  copropriete_id     text not null,                        -- ref logique vers public."Copropriete".id
  ag_date            date not null,                        -- jour de l'AG (cle metier, comme intranet_jalons)

  -- Creneau reel de l'AG : sert au calcul du depassement horaire
  -- (cf. src/lib/domain/facturation/depassement-ag.ts).
  debut_ag           timestamptz not null,
  fin_ag             timestamptz not null,

  -- --- Decisions de l'AG (ecrans NewRecapAGScreen1/2 du legacy) ---
  comptes_approuves  boolean,
  -- Observations libres sur l'approbation des comptes (« approuves avec reserves »).
  -- [A CONFIRMER] texte libre suppose (TextInput cote legacy) ; a basculer en
  -- numeric si c'est en fait un montant.
  reserves           text,
  budget_modifie     boolean,                              -- le budget presente a-t-il ete modifie en AG ?
  montant_budget     numeric(12,2) check (montant_budget is null or montant_budget >= 0),
  pourcentage_budget numeric(5,2),
  ppt_vote           boolean,                              -- Plan Pluriannuel de Travaux vote ?
  pourcentage_ppt    numeric(5,2),
  montant_ppt        numeric(12,2) check (montant_ppt is null or montant_ppt >= 0),
  fonds_travaux      boolean,                              -- fonds travaux (loi ALUR) : Oui/Non
  travaux_votes      boolean,                              -- detail dans intranet_recap_ag_travaux
  info_comptable     text,

  -- --- Depassement horaire calcule (cf. domain/facturation/depassement-ag) ---
  depassement_heures numeric(6,2) check (depassement_heures is null or depassement_heures >= 0),
  depassement_ttc    numeric(12,2) check (depassement_ttc is null or depassement_ttc >= 0),

  -- --- Rattachements (FK internes aux tables intranet_*) ---
  -- Cycle de contrat ouvert a l'occasion de cette AG : les honoraires / forfait
  -- postaux / date de debut vivent sur intranet_suivi_contrats, pas dupliques ici.
  suivi_contrat_id   uuid references public.intranet_suivi_contrats(id) on delete set null,
  -- Facture de depassement AG generee quand statut = 'a_facturer'.
  facture_id         uuid references public.intranet_factures(id) on delete set null,

  -- --- Cycle de vie (« Statut de creation » + logique NotifComptable) ---
  statut             text not null default 'nouveau'
                     check (statut in ('nouveau','a_facturer','termine','erreur')),
  -- Horodatage d'envoi de la notification comptable (mail bloque tant que
  -- l'integration Entra ID / Graph DSI n'est pas prete ; on trace quand meme).
  notif_comptable_at timestamptz,

  cree_par           text,                                 -- initiales tant qu'il n'y a pas d'auth
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Un seul recap par AG.
  unique (copropriete_id, ag_date)
);

create index if not exists intranet_recap_ag_copro_idx
  on public.intranet_recap_ag (copropriete_id, ag_date);
create index if not exists intranet_recap_ag_statut_idx
  on public.intranet_recap_ag (statut, created_at desc);

-- ============================================================================
-- Travaux votes en AG : 0..N par recap. Normalise le blob JSON « Travaux » du
-- legacy (libelle + budget + cle de repartition + modalites d'appel de fonds).
-- ============================================================================

create table if not exists public.intranet_recap_ag_travaux (
  id                    uuid primary key default gen_random_uuid(),
  recap_ag_id           uuid not null references public.intranet_recap_ag(id) on delete cascade,
  ordre                 integer not null default 1 check (ordre > 0),
  libelle               text not null,
  budget                numeric(12,2) check (budget is null or budget >= 0),
  cle_repartition       text,
  modalites_appel_fonds text,
  created_at            timestamptz not null default now(),
  unique (recap_ag_id, ordre)
);

create index if not exists intranet_recap_ag_travaux_recap_idx
  on public.intranet_recap_ag_travaux (recap_ag_id);
