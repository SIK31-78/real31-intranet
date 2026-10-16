-- Module « Contrats & contrôles » (REA-333, plan docs/plan-integration-suivi-contrats-copros.md,
-- décisions de Sekou du 16/10/2026) : l'intranet reprend l'application « Suivi des Contrats
-- Copros » du patron. Ses tables Prisma (InsuranceTracking, ElevatorCtq, GasVmcCtq,
-- GasContractTracking, offres, devis, Elevator, Document…) restent TELLES QUELLES dans la base
-- partagée (décision 5). Ce fichier n'ajoute que ce que l'intranet apporte de neuf :
--
--   1. intranet_contrats_journal : le journal immuable des gestes faits dans l'intranet
--      (étape datée, cycle clos, offre retenue, mail au CS…). L'historique de l'ancienne appli
--      (AuditLog, 2 697 lignes) reste en archive, jamais réécrit (décision 12).
--   2. Le référentiel d'entreprises des clés devient celui du CABINET (décision 4) : deux
--      colonnes sur intranet_cles_entreprise, `metiers` et `courtier_partenaire`.
--   3. intranet_copro_prestataire : la liaison copro <-> entreprise par métier, qui reprend
--      l'ancien carnet BuildingContact (152 liens, script scripts/contrats-reprendre-prestataires.mjs).
--
-- Pas de FK vers public."Copropriete" (référence logique par code copro `referenceCrypto`,
-- ex 'S004', comme le reste des intranet_*). RLS activée sans policy = service_role seul ;
-- le périmètre d'écriture est appliqué en code (ADR-041, coproAppartient).
--
-- Rejouable : `create table if not exists`, chaque colonne aussi en `add column if not exists`
-- (avertissement EXECUTES.md : une table déjà créée ne rattrape jamais une colonne ajoutée
-- après coup), index et trigger `if not exists` / `drop … if exists`.
--
-- Sans ce fichier l'app tourne : l'onglet Contrats lit et affiche les cycles de l'ancienne
-- appli, mais tout geste d'écriture échoue avec un message clair qui nomme ce fichier.

-- ---------------------------------------------------------------------------
-- 1. Journal des gestes : append-only. Aucun UPDATE ni DELETE, même en service_role.
-- Les valeurs de `sujet` et `type` sont celles de src/lib/domain/contrats-copro/types.ts
-- (SUJETS et TYPES_JOURNAL) : ajouter un type là-bas = ajouter une valeur ici.
-- ---------------------------------------------------------------------------
create table if not exists public.intranet_contrats_journal (
  id           uuid primary key default gen_random_uuid(),
  copro_code   text not null,                        -- code copro affiché, ex 'S004'
  sujet        text check (sujet in ('assurance', 'gaz', 'ctq_ascenseur', 'ctq_vmc')),
                                                     -- null = geste hors sujet (immeuble, prestataire)
  cycle_id     text,                                 -- id du cycle Prisma concerné (uuid texte), facultatif
  type         text not null check (type in (
                 'etape_datee', 'etape_effacee', 'suivi_demarre',
                 'cycle_clos', 'cycle_recloture',
                 'offre_creee', 'offre_retiree', 'offre_retenue',
                 'devis_cree', 'devis_retire', 'devis_retenu',
                 'contrat_corrige',
                 'appareil_cree', 'appareil_modifie',
                 'document_depose', 'document_retire',
                 'mail_cs_envoye', 'rappel_envoye',
                 'suivi_archive', 'immeuble_modifie',
                 'prestataire_lie', 'prestataire_delie')),
  horodatage   timestamptz not null default now(),   -- serveur, jamais saisi
  par_user_id  text,                                 -- public."User".id (référence logique)
  par_nom      text not null,
  details      jsonb not null default '{}'::jsonb    -- avant/après, montant, destinataires…
);
alter table public.intranet_contrats_journal add column if not exists sujet       text;
alter table public.intranet_contrats_journal add column if not exists cycle_id    text;
alter table public.intranet_contrats_journal add column if not exists par_user_id text;
alter table public.intranet_contrats_journal add column if not exists details     jsonb not null default '{}'::jsonb;

create index if not exists intranet_contrats_journal_copro_idx
  on public.intranet_contrats_journal (copro_code, horodatage desc);
create index if not exists intranet_contrats_journal_cycle_idx
  on public.intranet_contrats_journal (cycle_id, horodatage desc);

comment on table public.intranet_contrats_journal is
  'Journal immuable du module Contrats & contrôles : chaque geste fait dans l''intranet (étape datée, cycle clos, offre retenue, mail au CS…). Commence à la bascule ; l''historique de l''ancienne appli reste dans AuditLog (archive). Trigger anti update/delete.';

-- service_role contourne les revoke : l'immuabilité est un trigger, pas un droit
-- (même modèle que intranet_cles_mouvement_immuable).
create or replace function public.intranet_contrats_journal_immuable()
returns trigger language plpgsql as $$
begin
  raise exception 'intranet_contrats_journal est un journal immuable : % interdit (entrée %)', tg_op, old.id;
end;
$$;

drop trigger if exists intranet_contrats_journal_immuable_trg on public.intranet_contrats_journal;
create trigger intranet_contrats_journal_immuable_trg
  before update or delete on public.intranet_contrats_journal
  for each row execute function public.intranet_contrats_journal_immuable();

-- ---------------------------------------------------------------------------
-- 2. Le référentiel d'entreprises des clés devient celui du cabinet.
-- Né pour les trousseaux (ADR-040), il porte déjà le nom normalisé unique, les contacts et
-- le lien ESTALE `estale_supplier_id`. Les 37 contacts de l'ancienne appli (ascensoristes,
-- courtiers, fournisseurs de gaz) le rejoignent ; à terme, quand tout est dans ESTALE, cette
-- table n'est plus qu'un cache des Supplier ESTALE (décision du 16/10).
-- `metiers` : tableau libre de valeurs de METIERS_PRESTATAIRE (ascensoriste, societe_vmc,
-- courtier, fournisseur_gaz, organisme_controle, assureur). Vide = entreprise sans métier
-- connu (le cas de la plupart des entreprises venues des clés).
-- `courtier_partenaire` : vrai pour les quatre courtiers chez qui le suivi assurance est
-- archivé (Areas, Dissoubray, Galian-Smabtp, Paris Tronchet) ; n'a de sens qu'avec le métier
-- courtier, garde-fou laissé au code.
-- ---------------------------------------------------------------------------
alter table public.intranet_cles_entreprise add column if not exists metiers             text[]  not null default '{}';
alter table public.intranet_cles_entreprise add column if not exists courtier_partenaire boolean not null default false;

create index if not exists intranet_cles_entreprise_metiers_idx
  on public.intranet_cles_entreprise using gin (metiers);

comment on table public.intranet_cles_entreprise is
  'Référentiel d''entreprises du CABINET (né avec les clés, généralisé par Contrats & contrôles le 16/10/2026) : intervenants à qui l''on confie des trousseaux, ascensoristes, courtiers, fournisseurs de gaz, organismes de contrôle… Nom normalisé unique, lien ESTALE facultatif par estale_supplier_id (dérogation ADR-022 documentée dans ADR-040).';
comment on column public.intranet_cles_entreprise.metiers is
  'Métiers de l''entreprise pour le module Contrats & contrôles (valeurs de METIERS_PRESTATAIRE, src/lib/domain/contrats-copro/types.ts). Vide = inconnu.';
comment on column public.intranet_cles_entreprise.courtier_partenaire is
  'Courtier partenaire : les copros assurées chez lui n''ont pas de suivi assurance dans l''intranet (cycle archivé, le courtier s''en charge).';

-- ---------------------------------------------------------------------------
-- 3. Prestataires d'une copropriété, par métier (reprend BuildingContact).
-- Une copro peut avoir plusieurs ascensoristes (ensembles immobiliers) ; un seul est
-- « principal » par métier, c'est lui qu'on écrit en premier. La règle est garantie par la
-- base (index partiel unique), pas par l'écran.
-- ---------------------------------------------------------------------------
create table if not exists public.intranet_copro_prestataire (
  copro_code     text not null,                      -- code copro affiché, ex 'S004'
  entreprise_id  uuid not null references public.intranet_cles_entreprise (id),
  metier         text not null check (metier in (
                   'ascensoriste', 'societe_vmc', 'courtier',
                   'fournisseur_gaz', 'organisme_controle', 'assureur')),
  principal      boolean not null default false,
  created_at     timestamptz default now(),
  primary key (copro_code, entreprise_id, metier)
);
alter table public.intranet_copro_prestataire add column if not exists principal  boolean not null default false;
alter table public.intranet_copro_prestataire add column if not exists created_at timestamptz default now();

create unique index if not exists intranet_copro_prestataire_principal_unique_idx
  on public.intranet_copro_prestataire (copro_code, metier) where principal;
create index if not exists intranet_copro_prestataire_entreprise_idx
  on public.intranet_copro_prestataire (entreprise_id);

comment on table public.intranet_copro_prestataire is
  'Prestataires rattachés à une copropriété par métier (module Contrats & contrôles). Reprend le carnet BuildingContact de l''ancienne appli. Un seul principal par (copro, métier), garanti par index partiel unique.';

-- ---------------------------------------------------------------------------
-- RLS : activée sans policy = service_role seul (comme intranet_cles_*).
-- ---------------------------------------------------------------------------
alter table public.intranet_contrats_journal  enable row level security;
alter table public.intranet_copro_prestataire enable row level security;

-- Contrôle après exécution (attendu : 2 tables, 1 trigger, 2 colonnes) :
-- select count(*) from information_schema.tables
--   where table_name in ('intranet_contrats_journal', 'intranet_copro_prestataire');
-- select tgname from pg_trigger where tgname = 'intranet_contrats_journal_immuable_trg';
-- select column_name from information_schema.columns
--   where table_name = 'intranet_cles_entreprise' and column_name in ('metiers', 'courtier_partenaire');
