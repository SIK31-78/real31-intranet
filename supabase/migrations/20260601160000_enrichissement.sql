-- Migration d'enrichissement : ajouts schema pour Session B (branchement
-- des 3 ecrans MVP sur Supabase avec les vraies donnees LGC).
--
-- Decisions actees apres exploration eStale (cf. cartographie validee) :
-- - nom_complet sur users : utile pour affichage long, distinct de display_name
-- - estale_collaborator_id : preparation Phase B (mapping users <-> eStale)
-- - mnemonique / adresse_complement / agence_code / duree_ag_heures /
--   url_sharepoint / ppt_obligatoire / ag_connect_actif : champs metier REAL31
--   ou alignes eStale, requis par le seed CSV
-- - date_prochaine_ag / date_prochain_cs : pragmatique MVP (2 colonnes vs
--   creer une table evenements complete). A reverser quand on aura besoin
--   d'historique evenementiel structure.
-- - Table copro_collaborateurs : relations multi-roles (gestionnaire /
--   comptable / assistant). Aligne avec `Condo.collaborators` eStale.
--
-- Note : exercice_debut_mois / exercice_debut_jour existent deja dans la
-- migration initiale (smallint avec checks 1-12 / 1-31), pas redeclares ici.

-- ============================================================================
-- users : nom complet + ref eStale
-- ============================================================================

alter table real31_intranet.users
  add column nom_complet text not null default 'À renseigner',
  add column estale_collaborator_id text;

-- Index sur la ref eStale pour les joins futurs depuis la Phase B.
create index users_estale_collaborator_id_idx
  on real31_intranet.users (estale_collaborator_id)
  where estale_collaborator_id is not null;

-- ============================================================================
-- copros : champs metier requis par le seed CSV + les 3 ecrans MVP
-- ============================================================================

alter table real31_intranet.copros
  add column mnemonique text,
  add column adresse_complement text,
  add column agence_code text not null default 'LGC',
  add column duree_ag_heures integer default 2,
  add column url_sharepoint text,
  add column ppt_obligatoire boolean not null default false,
  add column ag_connect_actif boolean not null default false,
  add column date_prochaine_ag date,
  add column date_prochain_cs date;

-- Mnemonique unique par copro pour resolver le UUID v5 deterministe au seed.
create unique index copros_mnemonique_idx
  on real31_intranet.copros (mnemonique)
  where mnemonique is not null;

-- Filtres frequents Dashboard / Calendrier sur les dates AG/CS a venir.
create index copros_date_prochaine_ag_idx
  on real31_intranet.copros (date_prochaine_ag)
  where date_prochaine_ag is not null;
create index copros_date_prochain_cs_idx
  on real31_intranet.copros (date_prochain_cs)
  where date_prochain_cs is not null;

-- Filtre agence (multi-agences post-MVP, mono-LGC en MVP).
create index copros_agence_code_idx
  on real31_intranet.copros (agence_code)
  where archived_at is null;

-- ============================================================================
-- copro_collaborateurs : table de jointure (copro x user x role)
-- Equivalent fonctionnel de `Condo.collaborators` cote eStale, mais avec
-- les 3 roles fonctionnels REAL31 (gestionnaire / comptable / assistant).
-- ============================================================================

create table real31_intranet.copro_collaborateurs (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references real31_intranet.copros(id) on delete cascade,
  user_id uuid not null references real31_intranet.users(id) on delete cascade,
  role text not null check (role in ('gestionnaire', 'comptable', 'assistant')),
  created_at timestamptz not null default now(),
  -- Un user a au plus un role donne par copro (un comptable peut etre aussi
  -- gestionnaire d'une autre copro, mais pas les deux roles sur la meme).
  unique (copro_id, user_id, role)
);

create index copro_collaborateurs_copro_idx
  on real31_intranet.copro_collaborateurs (copro_id);
create index copro_collaborateurs_user_idx
  on real31_intranet.copro_collaborateurs (user_id);
create index copro_collaborateurs_role_idx
  on real31_intranet.copro_collaborateurs (role);

-- RLS : self read (un user voit ses propres rattachements).
-- Phase A : auth.uid() = NULL, donc retourne vide ; le seed et le Dashboard
-- passent par service_role qui bypass. Sera effective en Phase B (auth reelle).
alter table real31_intranet.copro_collaborateurs enable row level security;

create policy "copro_collaborateurs self read"
  on real31_intranet.copro_collaborateurs
  for select
  to authenticated
  using (user_id = auth.uid());

-- ============================================================================
-- Grants explicites sur la nouvelle table.
-- Redondants avec les `alter default privileges` de la migration initiale,
-- mais poses ici pour rester lisible et auto-suffisant (audit + relecture
-- de la migration sans avoir a remonter dans la 1ere).
-- ============================================================================

grant select on real31_intranet.copro_collaborateurs to anon;
grant select, insert, update, delete on real31_intranet.copro_collaborateurs to authenticated;
grant all on real31_intranet.copro_collaborateurs to service_role;
