-- Rôles et collaborateurs (16/09/2026, Sekou). Deux tables intranet en complément de
-- public."User" (App A), qui reste LA source du rôle (ADMIN, DIRECTEUR_SYNDIC, GESTIONNAIRE…)
-- et de l'agence :
--
-- 1. intranet_habilitation : ce que la table User ne sait pas dire. Exemple : Titouan (ML,
--    GESTIONNAIRE) est le référent syndic de Houilles, qui n'a pas de directeur ; il a donc
--    les droits de la direction (offres, élection, perte) — habilitation « referent_syndic »,
--    agence « HLS », datée.
-- 2. intranet_collaborateur : arrivée, départ, note. Un départ daté sort la personne du
--    sélecteur et des affectations (module « Collaborateurs », à venir) sans toucher App A.
--
-- RLS laissée off comme le reste de public (l'app lit/écrit via service_role).

create table if not exists public.intranet_habilitation (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,                       -- public."User".id
  habilitation  text not null check (habilitation in ('referent_syndic')),
  agence        text,                                -- code agence (ML / LGC / HLS / ASN), selon l'habilitation
  depuis        date not null default current_date,
  jusqua        date,                                -- null = en cours
  cree_par      text not null,
  created_at    timestamptz not null default now()
);
create index if not exists intranet_habilitation_user_idx on public.intranet_habilitation (user_id);

comment on table public.intranet_habilitation is
  'Habilitations intranet en complément de public.User.role : referent_syndic d''une agence (droits de direction). Datées.';

create table if not exists public.intranet_collaborateur (
  user_id     text primary key,                      -- public."User".id
  arrivee_le  date,
  depart_le   date,                                  -- renseigné = ne se connecte plus, sort du sélecteur
  note        text,
  maj_par     text,
  updated_at  timestamptz not null default now()
);

comment on table public.intranet_collaborateur is
  'Entrées et départs des collaborateurs (complément intranet de public.User). Un départ daté désactive la personne côté intranet.';

-- Titouan GAUDIN : référent syndic de Houilles (Sekou, 16/09/2026).
insert into public.intranet_habilitation (user_id, habilitation, agence, cree_par)
select u.id, 'referent_syndic', 'HLS', 'sql 16/09/2026'
from public."User" u
where u.name ilike 'Titouan GAUDIN'
  and not exists (select 1 from public.intranet_habilitation h where h.user_id = u.id and h.habilitation = 'referent_syndic' and h.agence = 'HLS');

-- Nicolas VINCENT et Phoebé LAJUS ne font plus partie du cabinet (Sekou, 16/09/2026).
insert into public.intranet_collaborateur (user_id, depart_le, maj_par)
select u.id, current_date, 'sql 16/09/2026'
from public."User" u
where u.name ilike 'Nicolas VINCENT' or u.name ilike 'Phoeb% LAJUS'
on conflict (user_id) do update set depart_le = excluded.depart_le, maj_par = excluded.maj_par, updated_at = now();
