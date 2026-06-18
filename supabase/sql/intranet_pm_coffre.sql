-- Gestionnaire de mots de passe maison, ZERO-KNOWLEDGE (ADR-025).
-- Tables natives intranet (schema public de la base patron, prefixe intranet_pm_).
-- A executer une fois dans le SQL editor Supabase, RLS activee (service_role passe).
--
-- PRINCIPE : le serveur ne voit JAMAIS ni mot de passe ni cle. Il ne stocke que :
--   - des BLOBS chiffres (cle privee de l'utilisateur wrappee, cles de coffre
--     wrappees, secrets chiffres) que seul un client peut dechiffrer ;
--   - des cles PUBLIQUES (par nature publiques) et de l'annuaire (email, agence).
-- Toute la cryptographie vit dans le navigateur (Web Crypto / SimpleWebAuthn).
--
-- LA RLS EST DE LA DEFENSE EN PROFONDEUR, PAS LE REMPART PRINCIPAL : meme si une
-- policy fuit, l'attaquant ne recupere que du chiffre inexploitable. Le vrai
-- controle de confidentialite, c'est la crypto.
--
-- IDENTITE / RLS : auth.uid() = intranet_pm_user.id. Le serveur valide le SSO
-- Entra puis emet un JWT compatible Supabase (sub = pm_user.id) -> les policies
-- comparent directement user_id = auth.uid(). Les ECRITURES passent par des
-- server actions en service_role avec controle applicatif (meme posture que le
-- reste de l'app) ; le serveur ne fait que persister des blobs deja chiffres
-- cote client, ce qui reste zero-knowledge. Les policies SELECT ci-dessous
-- portent le controle de LECTURE.

-- ========================================================================
-- Annuaire organisationnel
-- ========================================================================

-- 4 agences (dont 1 siege).
create table if not exists public.intranet_pm_agency (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  is_headquarters boolean not null default false,
  created_at      timestamptz not null default now()
);

-- 4 services (Vente, Syndic, Location, Gestion Locative). Un service est
-- TRANSVERSAL au reseau (cf. ADR-025) : un seul coffre Vente pour les 4 agences.
create table if not exists public.intranet_pm_service (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

-- Un collaborateur. Identite stable = azure_oid (object id Entra), cle de
-- jointure avec le SSO. La cle PRIVEE n'est PAS ici : elle vit, wrappee, dans
-- intranet_pm_user_unlock (une ligne par methode de deverrouillage).
create table if not exists public.intranet_pm_user (
  id            uuid primary key default gen_random_uuid(),
  azure_oid     text not null unique,
  email         text not null,
  display_name  text,
  agency_id     uuid references public.intranet_pm_agency (id),
  public_key    bytea not null,            -- cle publique ECDH P-256 (publique par nature)
  status        text not null default 'active',  -- active | suspended
  created_at    timestamptz not null default now()
);

-- Appartenance d'un collaborateur a 1+ services.
create table if not exists public.intranet_pm_user_service (
  user_id     uuid not null references public.intranet_pm_user (id) on delete cascade,
  service_id  uuid not null references public.intranet_pm_service (id) on delete cascade,
  primary key (user_id, service_id)
);

-- ========================================================================
-- Deverrouillage : la cle privee de l'utilisateur, wrappee PLUSIEURS fois
-- (une par methode). Le modele est agnostique a la methode (ADR-025).
-- ========================================================================

create table if not exists public.intranet_pm_user_unlock (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.intranet_pm_user (id) on delete cascade,
  -- passkey_prf (primaire) | master_password (repli) | recovery_code | admin_escrow
  method                text not null,
  label                 text,              -- ex "Poste bureau", "Cle de recuperation"
  -- cle privee ECDH de l'utilisateur, chiffree par la cle d'enrobage derivee de
  -- la methode (PRF, KDF du master password, etc.). Le serveur ne peut pas la lire.
  wrapped_private_key   bytea not null,
  -- parametres publics necessaires au deverrouillage cote client :
  -- credential_id de la passkey, salt + iterations KDF, algo, version crypto...
  params                jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists intranet_pm_user_unlock_user_idx
  on public.intranet_pm_user_unlock (user_id);

-- ========================================================================
-- Coffres : modele GENERIQUE par scope (ADR-025). Le niveau agence est prevu
-- mais LATENT (pas expose en UI) : l'ajouter plus tard = zero migration.
-- ========================================================================

create table if not exists public.intranet_pm_vault (
  id              uuid primary key default gen_random_uuid(),
  -- network (tous) | agency (latent) | service (transversal) | personal
  scope           text not null,
  agency_id       uuid references public.intranet_pm_agency (id),
  service_id      uuid references public.intranet_pm_service (id),
  owner_user_id   uuid references public.intranet_pm_user (id),
  name            text not null,
  -- standard | high : le tier "tres sensible" (step-up) ; exploite en phase 2.
  sensitivity     text not null default 'standard',
  created_at      timestamptz not null default now(),

  -- Coherence scope <-> FK : chaque scope ne renseigne que sa colonne.
  constraint pm_vault_scope_coherent check (
    (scope = 'network'  and agency_id is null and service_id is null and owner_user_id is null) or
    (scope = 'agency'   and agency_id is not null and service_id is null and owner_user_id is null) or
    (scope = 'service'  and service_id is not null and agency_id is null and owner_user_id is null) or
    (scope = 'personal' and owner_user_id is not null and agency_id is null and service_id is null)
  )
);

-- Unicite par scope : un seul coffre reseau ; un par service (transversal) ;
-- un par agence ; les coffres perso sont multiples, uniques par (owner, nom).
create unique index if not exists intranet_pm_vault_network_uniq
  on public.intranet_pm_vault ((true)) where scope = 'network';
create unique index if not exists intranet_pm_vault_service_uniq
  on public.intranet_pm_vault (service_id) where scope = 'service';
create unique index if not exists intranet_pm_vault_agency_uniq
  on public.intranet_pm_vault (agency_id) where scope = 'agency';
create unique index if not exists intranet_pm_vault_personal_uniq
  on public.intranet_pm_vault (owner_user_id, name) where scope = 'personal';

-- Appartenance a un coffre = la CLE DU COFFRE wrappee vers la cle publique du
-- membre. C'est le COEUR du partage : avoir acces = avoir une ligne ici.
create table if not exists public.intranet_pm_membership (
  id                uuid primary key default gen_random_uuid(),
  vault_id          uuid not null references public.intranet_pm_vault (id) on delete cascade,
  user_id           uuid not null references public.intranet_pm_user (id) on delete cascade,
  role              text not null default 'member',  -- member | admin
  -- cle AES-256-GCM du coffre, chiffree vers la cle publique du membre
  -- (ECDH + wrap). Calculee par un CLIENT (membre existant) ; le serveur la
  -- stocke sans pouvoir la lire.
  wrapped_vault_key bytea not null,
  granted_by        uuid references public.intranet_pm_user (id),  -- tracabilite de l'octroi
  created_at        timestamptz not null default now(),
  unique (vault_id, user_id)
);

create index if not exists intranet_pm_membership_user_idx
  on public.intranet_pm_membership (user_id);

-- Un secret (titre, url, login, mot de passe, notes) entierement chiffre avec
-- la cle du coffre. Metadonnees comprises dans le blob = zero fuite ; la
-- recherche se fait cote client apres dechiffrement.
create table if not exists public.intranet_pm_secret (
  id              uuid primary key default gen_random_uuid(),
  vault_id        uuid not null references public.intranet_pm_vault (id) on delete cascade,
  encrypted_blob  bytea not null,          -- AES-256-GCM
  nonce           bytea not null,          -- IV unique par chiffrement, jamais reutilise
  crypto_version  integer not null default 1,  -- agilite crypto : algo/params versionnes
  created_by      uuid references public.intranet_pm_user (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists intranet_pm_secret_vault_idx
  on public.intranet_pm_secret (vault_id);

-- ========================================================================
-- RLS : defense en profondeur. SELECT = controle de lecture ; les ecritures
-- passent par des server actions en service_role (qui contourne la RLS) avec
-- controle applicatif. service_role passe partout.
-- ========================================================================

alter table public.intranet_pm_agency        enable row level security;
alter table public.intranet_pm_service        enable row level security;
alter table public.intranet_pm_user           enable row level security;
alter table public.intranet_pm_user_service   enable row level security;
alter table public.intranet_pm_user_unlock    enable row level security;
alter table public.intranet_pm_vault          enable row level security;
alter table public.intranet_pm_membership     enable row level security;
alter table public.intranet_pm_secret         enable row level security;

-- Annuaire : lisible par tout utilisateur authentifie (cles publiques + agence
-- + services necessaires pour wrapper les cles de coffre vers les bons membres).
create policy pm_agency_read on public.intranet_pm_agency
  for select to authenticated using (true);
create policy pm_service_read on public.intranet_pm_service
  for select to authenticated using (true);
create policy pm_user_read on public.intranet_pm_user
  for select to authenticated using (true);
create policy pm_user_service_read on public.intranet_pm_user_service
  for select to authenticated using (true);

-- Cles privees wrappees : SEUL le proprietaire les voit.
create policy pm_user_unlock_self on public.intranet_pm_user_unlock
  for select to authenticated using (user_id = auth.uid());

-- Coffres : visibles si on en est membre.
create policy pm_vault_member_read on public.intranet_pm_vault
  for select to authenticated using (
    id in (select vault_id from public.intranet_pm_membership where user_id = auth.uid())
  );

-- Appartenances : les miennes, plus celles des coffres dont je suis admin.
create policy pm_membership_read on public.intranet_pm_membership
  for select to authenticated using (
    user_id = auth.uid()
    or vault_id in (
      select vault_id from public.intranet_pm_membership
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Secrets : visibles si on est membre du coffre. C'est la policy porteuse.
create policy pm_secret_member_read on public.intranet_pm_secret
  for select to authenticated using (
    vault_id in (select vault_id from public.intranet_pm_membership where user_id = auth.uid())
  );

-- Note : aucune policy INSERT/UPDATE/DELETE pour authenticated -> ces operations
-- ne passent que par service_role (server actions). Les flux d'octroi/rotation
-- cote client ecrivent des blobs deja chiffres via ces server actions. Des
-- policies d'ecriture directe pourront etre ajoutees par phase si besoin.
