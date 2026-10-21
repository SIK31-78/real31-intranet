-- Le BIEN HORS SYNDIC (ADR-049, Sekou 06/10/2026) : l'immeuble, l'appartement ou le local
-- que le cabinet gère en LOCATION ou met en VENTE, par opposition à la copropriété (syndic)
-- qui vit dans ESTALE et dont le référentiel existe déjà.
--
-- Pourquoi une table et pas deux colonnes sur l'accès d'un trousseau : Asnières (La Villa 92,
-- rachetée, bientôt REAL31 ASN) fait de la gestion locative, et « on va le faire pour toutes
-- les agences, real31.app aura bientôt des outils hors scope syndic » (Sekou, 06/10/2026).
-- Recopier l'adresse sur chaque trousseau aurait réglé la reprise Keyko et rien d'autre ;
-- ici les mandats, les baux et les états des lieux retrouveront le même objet.
--
-- Premier usage : les 260 biens repris de Keyko Manager pour les trousseaux d'ASN.
--
-- Pas de FK vers public."User" ni public."Agency" (référence logique par code agence, comme
-- tous les intranet_*). RLS activée sans policy = service_role seul, cloisonnement appliqué
-- en code (agence du bien + activité qui le gère, cf. domain/cles/acteur.ts).

-- ---------------------------------------------------------------------------
-- 1. Le bien
-- ---------------------------------------------------------------------------
create table if not exists public.intranet_bien (
  id                uuid primary key default gen_random_uuid(),
  agence_code       text not null,                      -- ML / LGC / HLS / ASN
  activite          text not null                       -- qui le gère : la location ou la transaction
                    check (activite in ('location', 'transaction')),
  reference         text not null,                      -- référence du cabinet, ex 'BASSEVILLE-20'
  type              text not null default 'autre'
                    check (type in ('immeuble', 'appartement', 'maison', 'parking', 'local', 'autre')),
  libelle           text not null default '',           -- nom d'usage quand la référence ne suffit pas

  -- Adresse structurée (reprise telle quelle de Keyko, qui la tient déjà en pièces).
  numero_voie       text,
  type_voie         text,                               -- rue, avenue, quai, mail...
  nom_voie          text,
  complement        text,
  code_postal       text,
  ville             text,

  digicode          text,
  -- Le PROPRIÉTAIRE reste un snapshot tant qu'aucun outil locatif ne l'exploite : un
  -- référentiel de personnes sans usage serait de la donnée personnelle gardée pour rien.
  -- Il deviendra une entité à part le jour des baux (ADR-049, « ce qu'on ne fait pas »).
  proprietaire_nom  text,
  proprietaire      jsonb,                              -- {nom, prenom, telephone, email}

  note              text,
  actif             boolean not null default true,      -- mandat fini = inactif, jamais supprimé

  -- Source : l'intranet fait foi par défaut. Si Asnières a un logiciel de gestion locative,
  -- ces deux colonnes permettent d'en devenir le miroir sans migration (question ouverte au
  -- 08/10/2026 : elle ne bloque plus la reprise).
  source            text not null default 'intranet'
                    check (source in ('intranet', 'import_keyko', 'externe')),
  source_ref        text,                               -- identifiant chez la source externe

  cree_par          text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.intranet_bien add column if not exists complement       text;
alter table public.intranet_bien add column if not exists digicode         text;
alter table public.intranet_bien add column if not exists proprietaire_nom text;
alter table public.intranet_bien add column if not exists proprietaire     jsonb;
alter table public.intranet_bien add column if not exists note             text;
alter table public.intranet_bien add column if not exists actif            boolean not null default true;
alter table public.intranet_bien add column if not exists source_ref       text;

-- Une référence ne vaut que dans son agence (Keyko a 2 références en doublon : elles seront
-- arbitrées à l'import, pas ici).
create unique index if not exists intranet_bien_agence_reference_idx
  on public.intranet_bien (agence_code, reference);
create index if not exists intranet_bien_activite_idx on public.intranet_bien (agence_code, activite) where actif;
create index if not exists intranet_bien_ville_idx    on public.intranet_bien (ville);

comment on table public.intranet_bien is
  'Bien hors syndic (location, transaction) : adresse, propriétaire, digicode. La copropriété, elle, vit dans ESTALE. ADR-049.';

-- ---------------------------------------------------------------------------
-- 2. L'accès d'un trousseau vise une copropriété OU un bien
-- Extension annoncée dans intranet_cles.sql (« le jour venu »), ADR-040.
-- ---------------------------------------------------------------------------
alter table public.intranet_cles_acces alter column copropriete_id drop not null;
alter table public.intranet_cles_acces add column if not exists bien_id uuid references public.intranet_bien (id);

-- Exactement une cible, jamais les deux, jamais aucune. Les lignes existantes (166 trousseaux
-- LGC, tous sur une copropriété) la respectent déjà.
alter table public.intranet_cles_acces drop constraint if exists intranet_cles_acces_une_cible;
alter table public.intranet_cles_acces add constraint intranet_cles_acces_une_cible
  check ((copropriete_id is not null) <> (bien_id is not null));

create index if not exists intranet_cles_acces_bien_idx on public.intranet_cles_acces (bien_id);

comment on column public.intranet_cles_acces.bien_id is
  'Bien hors syndic ouvert par ce trousseau (exclusif de copropriete_id).';

-- ---------------------------------------------------------------------------
-- RLS : activée sans policy = service_role seul (pattern du repo).
-- ---------------------------------------------------------------------------
alter table public.intranet_bien enable row level security;

-- Contrôle après exécution :
--   select count(*) from information_schema.columns
--    where table_name = 'intranet_cles_acces' and column_name = 'bien_id';          -- attendu 1
--   select is_nullable from information_schema.columns
--    where table_name = 'intranet_cles_acces' and column_name = 'copropriete_id';   -- attendu YES
--   select count(*) from public.intranet_bien;                                      -- attendu 0 avant import
