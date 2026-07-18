-- Table native intranet : dossiers d'onboarding "Reprise de copro".
--
-- A EXECUTER A LA MAIN une seule fois dans le SQL editor Supabase (base PARTAGEE du
-- patron). Deploy-only : jamais de `migrate reset` / `db reset` sur cette base.
--
-- Comme toutes les autres tables natives de l'intranet (intranet_jalons,
-- intranet_dossiers, intranet_sinistres, intranet_mes_emails_etat...), elle vit dans le
-- schema `public` de la base patron et s'accede via service_role (client
-- createSupabasePublicClient, schema public). Prefixe "reprise_" pour eviter toute
-- collision avec les tables Prisma (PascalCase) de l'App A.
--
-- Tant que la table n'existe pas, le module degrade proprement : la liste reste vide et la
-- creation est un no-op silencieux (pas de crash). Elle devient persistante des ce SQL
-- execute + COPRO_SOURCE=supabase cote app.
--
-- Une ligne par dossier. Cle = ref (reference eStale, ex "S0302"). Les parties variables
-- (etapes / compteurs / anomalies / journal) sont serialisees en JSONB : le domaine
-- (src/lib/reprise/domain/dossier.ts) fait foi pour leur forme.
--   etapes    : [{ code, phase, libelle, statut }]
--   compteurs : { nbLots?, nbCles?, nbCoproprietaires?, nbAttributions?, nbAnomalies?, nbFusionsEffectuees? }
--   anomalies : ["texte", ...]
--   journal   : [{ date, texte }]

create table if not exists public.reprise_dossier (
  ref          text primary key,                       -- reference eStale (ex "S0302")
  nom_usuel    text        not null default '',
  adresse      text,                                    -- adresse de l'immeuble (optionnelle)
  statut       text        not null default 'production',
  etapes       jsonb       not null default '[]'::jsonb,
  compteurs    jsonb       not null default '{}'::jsonb,
  anomalies    jsonb       not null default '[]'::jsonb,
  journal      jsonb       not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.reprise_dossier is
  'Dossiers d''onboarding copropriete (module Reprise de copro). Etapes/compteurs/anomalies/journal en JSONB. Cle = ref eStale.';

alter table public.reprise_dossier enable row level security;
-- RLS on, service_role uniquement (comme les autres tables intranet) : pas de policy
-- publique. Une reprise concerne une copro PAS ENCORE dans le perimetre eStale : il n'y a
-- pas de cloisonnement gestionnaire cote code non plus (cf. actions.ts du module reprise).
-- A affiner si l'outil expose un jour un acces authentifie cote client.
