-- Migration initiale du schema REAL31 Intranet.
--
-- Tout l'intranet vit dans le schema `real31_intranet`, isole du schema
-- `public` que le projet Supabase mutualise avec l'app A du patron
-- (Prisma + PascalCase, cf. ADR-021).
--
-- La RLS et les policies sont activees dans une migration suivante
-- (cf. ADR-011, migration 20260601120000_enable_rls.sql) pour rester
-- decoupable / desactivable independamment du schema.

-- ============================================================================
-- Extensions
-- ============================================================================

-- pgcrypto est typiquement deja active sur le projet Supabase (schema
-- `extensions`). `if not exists` rend la commande idempotente. Fournit
-- gen_random_uuid().
create extension if not exists "pgcrypto";

-- ============================================================================
-- Schema dedie
-- ============================================================================

create schema if not exists real31_intranet;

-- ============================================================================
-- Helper : trigger d'auto-update du champ updated_at
-- ============================================================================

create or replace function real31_intranet.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- Users (cf. ADR-009 permissions, ADR-010 mapping initiales)
-- ============================================================================

-- Une seule table pour tous les profils utilisateurs. Au MVP seul le role
-- 'gestionnaire' est actif cote permissions ; les autres roles sont prets
-- pour les vagues post-MVP sans refonte de schema.
create table real31_intranet.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text not null,
  role text not null check (role in (
    'gestionnaire',
    'assistant',
    'comptable',
    'directeur',
    'dirigeant',
    'admin'
  )),
  -- Initiales Crypto pour le matching avec copros.gestionnaire_initials.
  -- Renseigne uniquement pour role='gestionnaire' au MVP, etendu aux autres
  -- roles operationnels plus tard.
  gestionnaire_initials text,
  -- Pour role='assistant' : reference au gestionnaire dont il depend.
  -- Pas exploite au MVP, present pour anticiper la vague 1 post-MVP.
  reports_to_user_id uuid references real31_intranet.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index users_email_idx on real31_intranet.users (email);
create index users_initials_idx on real31_intranet.users (gestionnaire_initials)
  where gestionnaire_initials is not null;
create index users_role_active_idx on real31_intranet.users (role) where is_active = true;

create trigger users_set_updated_at
  before update on real31_intranet.users
  for each row execute function real31_intranet.set_updated_at();

-- ============================================================================
-- Cabinet settings (cf. ADR-006 systeme de jalons configurable)
-- ============================================================================

-- Parametres cabinet en cle/valeur typee JSONB. Les defaults REAL31 sont
-- seedees plus bas et peuvent etre surchargees post-MVP via une page admin.
--
-- Les delais legaux (loi 1965 / decret 1967) restent codes en dur dans
-- lib/domain/jalons-ag/legal/ pour eviter qu'une modif accidentelle de
-- ces valeurs cabinet ne tombe sous le legal.
create table real31_intranet.cabinet_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

create trigger cabinet_settings_set_updated_at
  before update on real31_intranet.cabinet_settings
  for each row execute function real31_intranet.set_updated_at();

-- Seed des defaults REAL31 pour les jalons d'AG.
insert into real31_intranet.cabinet_settings (key, value, description) values
  ('jalon.odj_cs.jours_avant_ag',
   '45',
   'Jalon REAL31 : validation ODJ avec le Conseil Syndical'),
  ('jalon.devis.jours_avant_ag',
   '45',
   'Jalon REAL31 : devis et documents techniques rassembles'),
  ('jalon.convocation.jours_avant_ag',
   '30',
   'Jalon REAL31 : envoi des convocations (cabinet J-30, plus strict que le legal J-21 art. 9 decret 1967)'),
  ('jalon.pouvoirs.jours_avant_ag',
   '2',
   'Jalon REAL31 : limite de reception des pouvoirs et votes par correspondance'),
  ('jalon.pouvoirs.jours_relance',
   '5',
   'Jalon REAL31 : delai recommande pour la relance des pouvoirs (avant la limite de reception)');

-- ============================================================================
-- Copropriétés (cf. ADR-003 migration progressive SharePoint -> eStale)
-- ============================================================================

create table real31_intranet.copros (
  id uuid primary key default gen_random_uuid(),
  -- Discriminateur de source. 'sharepoint' au MVP pour les 164 copros
  -- exportees de Crypto, 'estale' pour les 4 pilotes (puis 168 a terme),
  -- 'native' pour une copro creee directement dans l'intranet (cas edge).
  source text not null check (source in ('sharepoint', 'estale', 'native')),
  -- ID cote source externe (code Crypto type 'S016', ou ID eStale).
  -- Null si source='native'.
  source_id text,
  -- Code copro affiche dans l'UI (typiquement egal a source_id).
  code text not null,
  nom text not null,
  adresse text,
  ville text,
  code_postal text,
  -- Coordonnees geographiques pour la mini-carte Leaflet (cf. ADR-013).
  -- Geocodees via Nominatim OSM au moment du sync nocturne.
  lat double precision,
  lng double precision,
  -- Initiales du gestionnaire cote Crypto. Permet le filtrage par scope
  -- dans la RLS (Increment 5). Cf. ADR-010.
  gestionnaire_initials text,
  lots_principaux integer check (lots_principaux is null or lots_principaux > 0),
  tantiemes integer check (tantiemes is null or tantiemes > 0),
  -- Mois et jour de debut de l'exercice comptable (ex: 1/1 pour calendaire).
  exercice_debut_mois smallint check (exercice_debut_mois between 1 and 12),
  exercice_debut_jour smallint check (exercice_debut_jour between 1 and 31),
  date_prise_gestion date,
  statut text not null default 'active' check (statut in ('active', 'suspendu', 'archive')),
  -- Soft delete : jamais de DELETE physique pour preserver l'historique
  -- et les FK depuis evenements, jalons, activity_log.
  archived_at timestamptz,
  -- Horodatage du dernier sync depuis la source externe.
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Une copro est unique par (source, source_id) quand elle vient d'une
  -- source externe. Permet de retrouver une copro par son code Crypto/eStale
  -- pour un upsert idempotent depuis les jobs de sync.
  unique (source, source_id)
);

create index copros_code_idx on real31_intranet.copros (code);
create index copros_gestionnaire_idx on real31_intranet.copros (gestionnaire_initials)
  where archived_at is null;
create index copros_source_idx on real31_intranet.copros (source) where archived_at is null;
create index copros_synced_at_idx on real31_intranet.copros (synced_at);

create trigger copros_set_updated_at
  before update on real31_intranet.copros
  for each row execute function real31_intranet.set_updated_at();

-- ============================================================================
-- Evenements (cf. ADR-001 - schema unifie pour sources externes ET natives)
-- ============================================================================

-- Une seule table pour AG, AGE, CS, visites d'immeuble, RDV travaux.
-- Le champ 'source' distingue les evenements importes (SharePoint/eStale)
-- des evenements crees directement dans l'intranet ('native').
create table real31_intranet.evenements (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('sharepoint', 'estale', 'native')),
  source_id text,
  copro_id uuid not null references real31_intranet.copros(id) on delete cascade,
  type text not null check (type in ('AG', 'AGE', 'CS', 'VISITE', 'TRAVAUX')),
  titre text,
  date_evenement timestamptz not null,
  lieu text,
  statut text not null default 'planifiee' check (statut in (
    'planifiee',
    'en_preparation',
    'tenue',
    'annulee'
  )),
  -- Notes libres du gestionnaire. Donnee native intranet (jamais syncee
  -- vers la source externe, cf. ADR-002).
  notes text,
  archived_at timestamptz,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

create index evenements_copro_idx on real31_intranet.evenements (copro_id)
  where archived_at is null;
create index evenements_date_idx on real31_intranet.evenements (date_evenement);
create index evenements_type_statut_idx on real31_intranet.evenements (type, statut)
  where archived_at is null;
create index evenements_source_idx on real31_intranet.evenements (source);

create trigger evenements_set_updated_at
  before update on real31_intranet.evenements
  for each row execute function real31_intranet.set_updated_at();

-- ============================================================================
-- Jalons (cf. ADR-006) - natifs intranet, lies aux AG / AGE
-- ============================================================================

create table real31_intranet.jalons (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid not null references real31_intranet.evenements(id) on delete cascade,
  -- Code interne du jalon. Doit matcher les types definis dans
  -- lib/domain/jalons-ag/types.ts (a creer en Increment 2 cote code).
  type text not null check (type in (
    'ODJ_CS',
    'DEVIS',
    'CONVOCATION',
    'POUVOIRS',
    'TENUE'
  )),
  -- Date cible (calculee a partir de la date de l'evenement et des
  -- cabinet_settings, ou recalculee si la date de l'AG bouge).
  cible_date date not null,
  -- Date a laquelle le jalon a effectivement ete realise. Null = non realise.
  realise_date date,
  statut text not null default 'a_faire' check (statut in (
    'a_faire',
    'accompli',
    'en_alerte'
  )),
  -- Commentaire libre saisi au marquage (cf. mockup, ex: "CS de validation
  -- tenu en visio, ODJ valide a l'unanimite des presents 3/3").
  commentaire text,
  -- Utilisateur ayant marque le jalon (pour traçabilite et affichage UI).
  -- on delete set null pour conserver l'historique meme si l'user disparait.
  marque_par_user_id uuid references real31_intranet.users(id) on delete set null,
  marque_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un seul jalon de chaque type par evenement.
  unique (evenement_id, type)
);

create index jalons_evenement_idx on real31_intranet.jalons (evenement_id);
-- Index partiel : on cherche surtout les jalons a faire pour les alertes.
create index jalons_cible_date_idx on real31_intranet.jalons (cible_date)
  where statut = 'a_faire';
create index jalons_statut_idx on real31_intranet.jalons (statut)
  where statut != 'accompli';

create trigger jalons_set_updated_at
  before update on real31_intranet.jalons
  for each row execute function real31_intranet.set_updated_at();

-- ============================================================================
-- Items d'ordre du jour (cf. ADR-001)
-- ============================================================================

create table real31_intranet.item_odj (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid not null references real31_intranet.evenements(id) on delete cascade,
  ordre integer not null check (ordre > 0),
  libelle text not null,
  -- Regle de majorite applicable (loi 1965). 'sans_vote' pour les points
  -- d'information ou les "questions diverses".
  regle_majorite text check (regle_majorite in (
    'art24',
    'art25',
    'art25-1',
    'art26',
    'unanimite',
    'sans_vote'
  )),
  created_at timestamptz not null default now(),
  unique (evenement_id, ordre)
);

create index item_odj_evenement_idx on real31_intranet.item_odj (evenement_id);

-- ============================================================================
-- Membres du Conseil Syndical (cf. ADR-001)
-- ============================================================================

create table real31_intranet.membres_cs (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references real31_intranet.copros(id) on delete cascade,
  nom text not null,
  role text not null default 'membre' check (role in ('president', 'membre')),
  email text,
  telephone text,
  date_debut_mandat date,
  date_fin_mandat date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index membres_cs_copro_idx on real31_intranet.membres_cs (copro_id)
  where is_active = true;

create trigger membres_cs_set_updated_at
  before update on real31_intranet.membres_cs
  for each row execute function real31_intranet.set_updated_at();

-- ============================================================================
-- Presences pre-AG (cf. ADR-001)
-- ============================================================================

-- Compteurs de retour pre-AG saisis manuellement par le gestionnaire
-- au fur et a mesure que les pouvoirs et votes par correspondance arrivent.
create table real31_intranet.presence_pre_ag (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid not null references real31_intranet.evenements(id) on delete cascade,
  presents_prevus integer not null default 0 check (presents_prevus >= 0),
  pouvoirs_recus integer not null default 0 check (pouvoirs_recus >= 0),
  votes_correspondance_recus integer not null default 0
    check (votes_correspondance_recus >= 0),
  -- Total de lots votants au moment ou la fiche est creee. Fige la base
  -- meme si la copro evolue (lots vendus, modifies, etc.) entre la fiche
  -- et la tenue de l'AG.
  total_lots integer check (total_lots is null or total_lots > 0),
  updated_at timestamptz not null default now(),
  -- Une seule fiche presence par evenement.
  unique (evenement_id)
);

create trigger presence_pre_ag_set_updated_at
  before update on real31_intranet.presence_pre_ag
  for each row execute function real31_intranet.set_updated_at();

-- ============================================================================
-- Audit log RGPD (cf. ADR-007) - append-only, jamais user-facing
-- ============================================================================

-- Conformite RGPD niveau (b) : trace toutes les modifications et les
-- lectures de donnees sensibles. Jamais expose via l'UI utilisateur.
-- Page admin /admin/audit reservee au role 'admin' pour consultation.
--
-- bigserial plutot que uuid : append-only haut volume, l'integer est plus
-- compact et plus rapide a indexer chronologiquement.
create table real31_intranet.audit_log (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  -- Nullable pour les actions systeme (jobs cron, scripts admin).
  actor_user_id uuid references real31_intranet.users(id) on delete set null,
  -- Role au moment de l'action (peut differer du role actuel si l'user
  -- change de role apres coup).
  actor_role text not null,
  -- Code de l'action, ex: 'copro.read.sensitive', 'jalon.update', 'jalon.delete'.
  action text not null,
  resource_type text not null,
  resource_id text,
  -- Details additionnels (champs modifies, valeurs avant/apres, contexte).
  metadata jsonb,
  ip_address inet,
  user_agent text
);

create index audit_log_occurred_at_idx on real31_intranet.audit_log (occurred_at desc);
create index audit_log_actor_user_id_idx on real31_intranet.audit_log (actor_user_id, occurred_at desc);
create index audit_log_resource_idx on real31_intranet.audit_log (resource_type, resource_id, occurred_at desc);
create index audit_log_action_idx on real31_intranet.audit_log (action);

-- ============================================================================
-- Activity log produit (cf. ADR-007) - user-facing dans l'UI
-- ============================================================================

-- Historique des actions affiche dans l'UI (ex: "FS a marque les
-- convocations comme envoyees le 25 mai"). Requete par ressource pour
-- afficher le fil d'activite d'une AG, d'une copro, etc.
create table real31_intranet.activity_log (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  -- NOT NULL : pas d'actions systeme dans l'activity log, uniquement les
  -- actions metier user-meaningful. Les actions systeme vont dans audit_log
  -- uniquement.
  actor_user_id uuid not null references real31_intranet.users(id),
  resource_type text not null,
  resource_id uuid not null,
  -- Code d'action stable, independant de la traduction.
  -- Ex: 'jalon.marked_done', 'event.date_set', 'event.created'.
  action_code text not null,
  -- Payload serialise pour reconstruire l'affichage UI (libelle traduit,
  -- valeurs cles, etc.) sans avoir besoin de rejoindre d'autres tables.
  payload jsonb
);

create index activity_log_resource_idx on real31_intranet.activity_log (resource_type, resource_id, occurred_at desc);
create index activity_log_actor_idx on real31_intranet.activity_log (actor_user_id, occurred_at desc);

-- ============================================================================
-- Job runs (cf. ADR-004) - observabilite des jobs cron
-- ============================================================================

create table real31_intranet.job_runs (
  id bigserial primary key,
  job_name text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null check (status in ('running', 'success', 'failed', 'cancelled')),
  error text,
  -- Stats du run (nb items traites, duree, etc.).
  metadata jsonb
);

create index job_runs_name_started_idx on real31_intranet.job_runs (job_name, started_at desc);
-- Index partiel : on cherche surtout les runs en cours ou en erreur pour
-- l'alerting et le debug.
create index job_runs_status_idx on real31_intranet.job_runs (status, started_at desc)
  where status != 'success';

-- ============================================================================
-- Grants : permissions baseline.
-- La RLS (migration suivante 20260601120000_enable_rls.sql) filtre ensuite
-- ligne par ligne. Sans grants, PostgREST ne voit meme pas le schema.
-- ============================================================================

grant usage on schema real31_intranet to anon, authenticated, service_role;

grant select on all tables in schema real31_intranet to anon;
grant select, insert, update, delete on all tables in schema real31_intranet to authenticated;
grant all on all tables in schema real31_intranet to service_role;

grant usage, select on all sequences in schema real31_intranet to anon, authenticated;
grant all on all sequences in schema real31_intranet to service_role;

grant execute on all functions in schema real31_intranet to authenticated, service_role;

-- Defaults appliques aux objets crees par les migrations futures, sans avoir
-- a re-grant manuellement a chaque table ajoutee.
alter default privileges in schema real31_intranet
  grant select on tables to anon;
alter default privileges in schema real31_intranet
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema real31_intranet
  grant all on tables to service_role;
alter default privileges in schema real31_intranet
  grant usage, select on sequences to anon, authenticated;
alter default privileges in schema real31_intranet
  grant all on sequences to service_role;
alter default privileges in schema real31_intranet
  grant execute on functions to authenticated, service_role;
