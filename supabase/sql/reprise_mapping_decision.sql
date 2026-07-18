-- Table native intranet : DECISIONS de revue du mapping comptable (module Reprise de copro).
--
-- A EXECUTER A LA MAIN une seule fois dans le SQL editor Supabase (base PARTAGEE du patron).
-- Deploy-only : jamais de `migrate reset` / `db reset` sur cette base.
--
-- Comme reprise_dossier et les autres tables natives de l'intranet, elle vit dans le schema
-- `public` de la base patron et s'accede via service_role (client createSupabasePublicClient,
-- schema public). Prefixe "reprise_" pour eviter toute collision avec les tables Prisma
-- (PascalCase) de l'App A.
--
-- Tant que la table n'existe pas, le module degrade proprement : aucune decision n'est
-- rechargee et l'enregistrement est un no-op silencieux (pas de crash). Elle devient
-- persistante des ce SQL execute + COPRO_SOURCE=supabase cote app.
--
-- Une ligne par decision humaine. Cle = (copro_code, compte_source). La decision est
-- serialisee en JSONB : le domaine (src/lib/reprise/domain/decisions-mapping.ts) fait foi
-- pour sa forme.
--   decision : { type: "valider_candidat" }
--            | { type: "choisir_cible", nomenclature: "4500001" }
--            | { type: "creer_fournisseur" }
--            | { type: "ignorer", motif: "..." }
-- ATTENTION PII : un motif "ignorer" peut contenir un nom -> base interne, jamais logue.

create table if not exists public.reprise_mapping_decision (
  copro_code    text        not null,                 -- code copro eStale (ex "S0302")
  compte_source text        not null,                 -- compte source du grand livre N-1
  decision      jsonb       not null,                 -- geste humain (union, cf. domaine)
  decideur      text,                                 -- id technique gestionnaire (jamais un nom)
  decided_at    timestamptz not null default now(),
  primary key (copro_code, compte_source)
);

comment on table public.reprise_mapping_decision is
  'Decisions humaines de revue du mapping comptable (module Reprise de copro). Cle = (copro_code, compte_source). Decision en JSONB (cf. domain/decisions-mapping.ts).';

alter table public.reprise_mapping_decision enable row level security;
-- RLS on, service_role uniquement (comme reprise_dossier et les autres tables intranet) : pas
-- de policy publique. Une reprise concerne une copro PAS ENCORE dans le perimetre eStale : il
-- n'y a pas de cloisonnement gestionnaire cote code non plus (cf. actions.ts du module reprise).
-- A affiner si l'outil expose un jour un acces authentifie cote client.
