-- Table native intranet : FICHES DE RENSEIGNEMENTS coproprietaire (module Reprise de copro).
--
-- A EXECUTER A LA MAIN une seule fois dans le SQL editor Supabase (base PARTAGEE du patron).
-- Deploy-only : jamais de `migrate reset` / `db reset` sur cette base.
--
-- Comme reprise_dossier / reprise_mapping_decision, elle vit dans le schema `public` de la base
-- patron et s'accede via service_role (client createSupabasePublicClient). Prefixe "reprise_".
--
-- Tant que la table n'existe pas, le module degrade proprement : listes vides, ecriture no-op
-- silencieux (pas de crash). Persistante des ce SQL execute + COPRO_SOURCE=supabase cote app.
--
-- Flux : le cabinet genere un courrier par coproprietaire (statut 'courrier_genere'), le
-- coproprietaire remplit le formulaire web ('soumis'), le gestionnaire valide -> email ecrit
-- dans eStale + mail espace client ('valide').
--
-- SECURITE : le token du lien et le code personnel imprime sont stockes HASHES (SHA-256 hex) ;
-- jamais en clair. token_hash est UNIQUE (lookup du lien public). connues / donnees_soumises
-- sont des JSONB PII (base interne, jamais logue). Le domaine
-- (src/lib/reprise/domain/fiche-renseignements.ts) fait foi pour leur forme.
--   connues         : { civilite, nom, prenom?, pro, emailConnu?, telFixe?, telPortable?, adr*?, lots? }
--   donnees_soumises: { email, telFixe?, ..., occupation?, prelevement?, consent*? }

create table if not exists public.reprise_fiche_renseignements (
  copro_code          text        not null,               -- reference copro eStale (ex "S0302")
  owner_id            text        not null,               -- Owner.id interne du jeu de reprise
  token_hash          text        not null,               -- SHA-256 hex du token du lien
  code_hash           text        not null,               -- SHA-256 hex du code personnel imprime
  statut              text        not null default 'courrier_genere', -- courrier_genere|soumis|valide
  connues             jsonb       not null default '{}'::jsonb,       -- snapshot cabinet (PII)
  donnees_soumises    jsonb,                                          -- reponse du coproprietaire (PII)
  courrier_genere_at  timestamptz not null default now(),
  soumis_at           timestamptz,
  valide_at           timestamptz,
  mail_envoye_at      timestamptz,
  derniere_relance_at timestamptz,
  expires_at          timestamptz not null,
  primary key (copro_code, owner_id)
);

-- Lookup du lien public : un token -> une fiche. Unique (anti-collision + integrite).
create unique index if not exists reprise_fiche_token_hash_idx
  on public.reprise_fiche_renseignements (token_hash);

comment on table public.reprise_fiche_renseignements is
  'Fiches de renseignements coproprietaire (module Reprise de copro). Cle = (copro_code, owner_id). token/code HASHES ; connues/donnees_soumises PII en JSONB (cf. domain/fiche-renseignements.ts).';

alter table public.reprise_fiche_renseignements enable row level security;
-- RLS on, service_role uniquement (comme les autres tables intranet) : pas de policy publique.
-- La route publique /fiche/[token] passe par le service_role cote serveur (jamais d'acces
-- client direct a Supabase) et n'expose rien sans le code correct (anti-enumeration en code).
