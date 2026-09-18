-- Module « Gestion des clés » (ADR-040, Sekou 18/09/2026) : remplace la canvas app
-- PowerApps « Gestion des Clés » de MYTHEC (5 listes SharePoint, LGC seule).
-- Audit et conception : docs/audit-gestion-des-cles-2026-09-18.md.
--
-- Principe : UN SEUL FAIT STOCKÉ PAR VÉRITÉ. Le trousseau ne porte pas d'état « sorti » /
-- « réservé » : il se déduit du prêt ouvert et des réservations (le statut écrasable était
-- le défaut de PowerApps : 57 anomalies de journal en 2 ans). Seules les marques qu'aucun
-- prêt ne peut déduire (introuvable, retiré) sont stockées.
--
-- Pas de FK vers public."Copropriete" / public."User" (référence logique par code copro
-- `referenceCrypto`, ex 'S004', et par User.id), comme le reste des intranet_*.
-- RLS activée sans policy = service_role seul (dernier pattern du repo) ; le cloisonnement
-- par agence est appliqué en code. Idempotent : chaque colonne est aussi déclarée en
-- `add column if not exists` (avertissement EXECUTES.md).
--
-- Photos : bucket Storage privé `cles` (à créer dans le dashboard Supabase, hors SQL),
-- chemins `trousseaux/<id>.jpg` et `retours/<pretId>.jpg`, servis par URL signée courte.

-- ---------------------------------------------------------------------------
-- 1. Trousseaux
-- ---------------------------------------------------------------------------
create table if not exists public.intranet_cles_trousseau (
  id             uuid primary key default gen_random_uuid(),
  agence_code    text not null,                       -- ML / LGC / HLS / ASN
  numero         text not null,                       -- R004, J045 (unique par agence)
  libelle        text not null default '',
  emplacement    text,                                -- tiroir / armoire, ex 'T041'
  composition    jsonb not null default '[]'::jsonb,  -- [{type, libelle, quantite}]
  photo_chemin   text,                                -- chemin dans le bucket `cles`
  marque         text check (marque in ('introuvable', 'retire')),
  marque_depuis  timestamptz,
  jumeau_de      uuid,                                -- double d'un autre trousseau
  note           text,
  source         text not null default 'intranet' check (source in ('intranet', 'import_powerapps')),
  cree_par       text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.intranet_cles_trousseau add column if not exists agence_code   text not null default 'LGC';
alter table public.intranet_cles_trousseau add column if not exists numero        text not null default '';
alter table public.intranet_cles_trousseau add column if not exists libelle       text not null default '';
alter table public.intranet_cles_trousseau add column if not exists emplacement   text;
alter table public.intranet_cles_trousseau add column if not exists composition   jsonb not null default '[]'::jsonb;
alter table public.intranet_cles_trousseau add column if not exists photo_chemin  text;
alter table public.intranet_cles_trousseau add column if not exists marque        text;
alter table public.intranet_cles_trousseau add column if not exists marque_depuis timestamptz;
alter table public.intranet_cles_trousseau add column if not exists jumeau_de     uuid;
alter table public.intranet_cles_trousseau add column if not exists note          text;
alter table public.intranet_cles_trousseau add column if not exists source        text not null default 'intranet';
alter table public.intranet_cles_trousseau add column if not exists cree_par      text not null default '';
alter table public.intranet_cles_trousseau add column if not exists created_at    timestamptz not null default now();
alter table public.intranet_cles_trousseau add column if not exists updated_at    timestamptz not null default now();

create unique index if not exists intranet_cles_trousseau_agence_numero_idx
  on public.intranet_cles_trousseau (agence_code, numero);

comment on table public.intranet_cles_trousseau is
  'Trousseaux de clés prêtés au comptoir (module Gestion des clés). Aucun état stocké hors marque : sorti/réservé/en retard se déduisent des prêts et réservations.';

-- ---------------------------------------------------------------------------
-- 2. Accès : ce qu'ouvre un trousseau (copro obligatoire, immeuble facultatif)
-- Extension prévue (Sekou 18/09) : la gestion locative et la vente ont aussi des
-- trousseaux. Le jour venu : copropriete_id devient facultatif + colonnes bien_type
-- (copro | lot_locatif | bien_vente) et bien_ref, par `alter table`, prêts et journal inchangés.
-- ---------------------------------------------------------------------------
create table if not exists public.intranet_cles_acces (
  id              uuid primary key default gen_random_uuid(),
  trousseau_id    uuid not null references public.intranet_cles_trousseau (id) on delete cascade,
  copropriete_id  text not null,                      -- code copro affiché, ex 'S004'
  immeuble        text,                               -- libellé libre, ou nom du Building ESTALE
  types           text[] not null default '{}',       -- total, local_fibre, chaufferie, caves, toiture...
  libelle         text not null default '',
  ordre           int not null default 0,             -- ordre 0 = copro principale
  created_at      timestamptz not null default now()
);
alter table public.intranet_cles_acces add column if not exists immeuble text;
alter table public.intranet_cles_acces add column if not exists types    text[] not null default '{}';
alter table public.intranet_cles_acces add column if not exists libelle  text not null default '';
alter table public.intranet_cles_acces add column if not exists ordre    int not null default 0;

create index if not exists intranet_cles_acces_copro_idx     on public.intranet_cles_acces (copropriete_id);
create index if not exists intranet_cles_acces_trousseau_idx on public.intranet_cles_acces (trousseau_id, ordre);

comment on table public.intranet_cles_acces is
  'Jonction trousseau <-> copropriété (+ immeuble et types d''accès). Un trousseau peut ouvrir plusieurs copros (ensembles immobiliers).';

-- ---------------------------------------------------------------------------
-- 3. Entreprises (référentiel CABINET : une entreprise sert plusieurs agences)
-- ---------------------------------------------------------------------------
create table if not exists public.intranet_cles_entreprise (
  id                  uuid primary key default gen_random_uuid(),
  nom                 text not null,
  nom_normalise       text not null,                  -- minuscules sans accents ni ponctuation
  telephone           text,
  email               text,
  adresse             jsonb,                          -- {ligne1, ligne2, codePostal, ville}
  contacts            jsonb not null default '[]'::jsonb,  -- [{nom, telephone, email, principal}]
  note                text,
  statut              text not null default 'active' check (statut in ('active', 'bloquee')),
  motif_blocage       text,
  relances            boolean not null default true,  -- opt-out des mails de relance
  estale_supplier_id  text,                           -- lien facultatif vers un Supplier ESTALE
  source              text not null default 'intranet' check (source in ('intranet', 'import_powerapps')),
  cree_par            text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.intranet_cles_entreprise add column if not exists nom_normalise      text not null default '';
alter table public.intranet_cles_entreprise add column if not exists telephone          text;
alter table public.intranet_cles_entreprise add column if not exists email              text;
alter table public.intranet_cles_entreprise add column if not exists adresse            jsonb;
alter table public.intranet_cles_entreprise add column if not exists contacts           jsonb not null default '[]'::jsonb;
alter table public.intranet_cles_entreprise add column if not exists note               text;
alter table public.intranet_cles_entreprise add column if not exists statut             text not null default 'active';
alter table public.intranet_cles_entreprise add column if not exists motif_blocage      text;
alter table public.intranet_cles_entreprise add column if not exists relances           boolean not null default true;
alter table public.intranet_cles_entreprise add column if not exists estale_supplier_id text;
alter table public.intranet_cles_entreprise add column if not exists source             text not null default 'intranet';

create unique index if not exists intranet_cles_entreprise_nom_normalise_idx
  on public.intranet_cles_entreprise (nom_normalise);

comment on table public.intranet_cles_entreprise is
  'Entreprises / intervenants à qui l''on confie des trousseaux. Référentiel cabinet autonome, lien ESTALE facultatif (dérogation ADR-022 documentée dans ADR-040).';

-- ---------------------------------------------------------------------------
-- 4. Réservations (un souhait, indépendant de l'état physique du trousseau)
-- ---------------------------------------------------------------------------
create table if not exists public.intranet_cles_reservation (
  id                uuid primary key default gen_random_uuid(),
  trousseau_id      uuid not null references public.intranet_cles_trousseau (id),
  entreprise_id     uuid references public.intranet_cles_entreprise (id),
  contact           jsonb,                            -- snapshot {nom, telephone, email}
  debut             date not null,
  fin_prevue        date not null,
  motif             text,                             -- l'intervention
  origine           text not null default 'interne' check (origine in ('interne', 'externe')),
  statut            text not null default 'prevue' check (statut in ('prevue', 'convertie', 'annulee')),
  pret_id           uuid,                             -- renseigné quand convertie
  annulee_le        timestamptz,
  annulee_par       text,
  motif_annulation  text,
  cree_par          text not null,
  created_at        timestamptz not null default now()
);
alter table public.intranet_cles_reservation add column if not exists contact          jsonb;
alter table public.intranet_cles_reservation add column if not exists motif            text;
alter table public.intranet_cles_reservation add column if not exists origine          text not null default 'interne';
alter table public.intranet_cles_reservation add column if not exists pret_id          uuid;
alter table public.intranet_cles_reservation add column if not exists annulee_le       timestamptz;
alter table public.intranet_cles_reservation add column if not exists annulee_par      text;
alter table public.intranet_cles_reservation add column if not exists motif_annulation text;

create index if not exists intranet_cles_reservation_trousseau_idx on public.intranet_cles_reservation (trousseau_id, debut);
create index if not exists intranet_cles_reservation_statut_idx    on public.intranet_cles_reservation (statut, debut);

comment on table public.intranet_cles_reservation is
  'Réservations de trousseaux. « expirée » n''est jamais stocké : prevue + debut < aujourd''hui, calculé par le domaine.';

-- ---------------------------------------------------------------------------
-- 5. Prêts : le cycle sortie -> retour. Un seul prêt ouvert par trousseau.
-- ---------------------------------------------------------------------------
create table if not exists public.intranet_cles_pret (
  id                   uuid primary key default gen_random_uuid(),
  trousseau_id         uuid not null references public.intranet_cles_trousseau (id),
  type                 text not null default 'entreprise' check (type in ('entreprise', 'interne')),
  entreprise_id        uuid references public.intranet_cles_entreprise (id),
  contact              jsonb,                          -- snapshot à la sortie
  composition          jsonb not null default '[]'::jsonb,  -- snapshot à la sortie (contrôle au retour)
  reservation_id       uuid,
  motif                text,
  sorti_le             timestamptz not null default now(),
  sorti_par_id         text,                           -- public."User".id
  sorti_par_nom        text not null,
  retour_prevu_le      date not null,
  rendu_le             timestamptz,
  recu_par_id          text,
  recu_par_nom         text,
  retour_conforme      text check (retour_conforme in ('complet', 'incomplet', 'endommage')),
  commentaire_retour   text,
  photo_retour_chemin  text,
  created_at           timestamptz not null default now(),
  constraint intranet_cles_pret_interne_sans_entreprise
    check ((type = 'interne') = (entreprise_id is null))
);
alter table public.intranet_cles_pret add column if not exists contact             jsonb;
alter table public.intranet_cles_pret add column if not exists composition         jsonb not null default '[]'::jsonb;
alter table public.intranet_cles_pret add column if not exists reservation_id      uuid;
alter table public.intranet_cles_pret add column if not exists motif               text;
alter table public.intranet_cles_pret add column if not exists sorti_par_id        text;
alter table public.intranet_cles_pret add column if not exists recu_par_id         text;
alter table public.intranet_cles_pret add column if not exists recu_par_nom        text;
alter table public.intranet_cles_pret add column if not exists retour_conforme     text;
alter table public.intranet_cles_pret add column if not exists commentaire_retour  text;
alter table public.intranet_cles_pret add column if not exists photo_retour_chemin text;

-- La règle métier centrale, garantie par la base : un trousseau n'est sorti qu'une fois.
create unique index if not exists intranet_cles_pret_ouvert_unique_idx
  on public.intranet_cles_pret (trousseau_id) where rendu_le is null;
create index if not exists intranet_cles_pret_entreprise_idx on public.intranet_cles_pret (entreprise_id, rendu_le);
create index if not exists intranet_cles_pret_retard_idx     on public.intranet_cles_pret (retour_prevu_le) where rendu_le is null;
create index if not exists intranet_cles_pret_trousseau_idx  on public.intranet_cles_pret (trousseau_id, sorti_le desc);

comment on table public.intranet_cles_pret is
  'Prêts de trousseaux (sortie -> retour). rendu_le null = sorti ; retour_prevu_le < aujourd''hui = en retard (dérivé). Snapshots contact et composition figés à la sortie.';

-- ---------------------------------------------------------------------------
-- 6. Mouvements : journal append-only. Aucun UPDATE ni DELETE, même en service_role.
-- ---------------------------------------------------------------------------
create table if not exists public.intranet_cles_mouvement (
  id              uuid primary key default gen_random_uuid(),
  trousseau_id    uuid not null references public.intranet_cles_trousseau (id),
  type            text not null check (type in (
                    'creation', 'modification', 'composition_modifiee',
                    'reservation', 'annulation_reservation',
                    'sortie', 'prolongation', 'retour',
                    'introuvable', 'retrouve', 'retrait',
                    'correction', 'relance', 'import')),
  horodatage      timestamptz not null default now(),  -- serveur, jamais saisi
  par_user_id     text,
  par_nom         text not null,
  agence_code     text not null,
  entreprise_id   uuid,
  pret_id         uuid,
  reservation_id  uuid,
  corrige_id      uuid,                                -- mouvement corrigé (type = correction)
  details         jsonb not null default '{}'::jsonb   -- avant/après, motif, conformité, incohérence d'import
);
alter table public.intranet_cles_mouvement add column if not exists entreprise_id  uuid;
alter table public.intranet_cles_mouvement add column if not exists pret_id        uuid;
alter table public.intranet_cles_mouvement add column if not exists reservation_id uuid;
alter table public.intranet_cles_mouvement add column if not exists corrige_id     uuid;
alter table public.intranet_cles_mouvement add column if not exists details        jsonb not null default '{}'::jsonb;

create index if not exists intranet_cles_mouvement_trousseau_idx  on public.intranet_cles_mouvement (trousseau_id, horodatage desc);
create index if not exists intranet_cles_mouvement_entreprise_idx on public.intranet_cles_mouvement (entreprise_id, horodatage desc);
create index if not exists intranet_cles_mouvement_horodatage_idx on public.intranet_cles_mouvement (horodatage desc);

comment on table public.intranet_cles_mouvement is
  'Journal immuable des mouvements de clés. Une correction est un nouveau mouvement (corrige_id), jamais une modification. Trigger anti update/delete.';

-- service_role contourne les revoke : l'immuabilité est un trigger, pas un droit.
create or replace function public.intranet_cles_mouvement_immuable()
returns trigger language plpgsql as $$
begin
  raise exception 'intranet_cles_mouvement est un journal immuable : % interdit (mouvement %)', tg_op, old.id;
end;
$$;

drop trigger if exists intranet_cles_mouvement_immuable_trg on public.intranet_cles_mouvement;
create trigger intranet_cles_mouvement_immuable_trg
  before update or delete on public.intranet_cles_mouvement
  for each row execute function public.intranet_cles_mouvement_immuable();

-- ---------------------------------------------------------------------------
-- RLS : activée sans policy = service_role seul (comme reprise_fiche_renseignements).
-- ---------------------------------------------------------------------------
alter table public.intranet_cles_trousseau   enable row level security;
alter table public.intranet_cles_acces       enable row level security;
alter table public.intranet_cles_entreprise  enable row level security;
alter table public.intranet_cles_reservation enable row level security;
alter table public.intranet_cles_pret        enable row level security;
alter table public.intranet_cles_mouvement   enable row level security;

-- Contrôle après exécution (attendu : 6 tables, 1 trigger) :
-- select count(*) from information_schema.tables where table_name like 'intranet_cles_%';
-- select tgname from pg_trigger where tgname = 'intranet_cles_mouvement_immuable_trg';
