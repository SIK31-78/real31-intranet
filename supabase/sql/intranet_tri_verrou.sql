-- TRI DES E-MAILS : verrou par boite de la tache planifiee (ADR-046, revision V2 du
-- 27/10/2026, REA-420).
--
-- A executer une fois dans le SQL editor Supabase de la base cible. Idempotent.
--
-- POURQUOI : chaque boite triee a son cron toutes les 5 min (/api/cron/tri-emails/<boite>), et
-- rien n'empechait deux passages de la meme boite de tourner en meme temps (un passage qui
-- traine, un declenchement a la main) : deux lectures du delta, deux reconciliations, deux
-- automatiques sur les memes mails. Le verrou garantit un passage a la fois par boite.
--
-- Pas de pg_try_advisory_xact_lock : un verrou de transaction tombe a la fin de l'appel
-- PostgREST, avant meme que la tache commence. D'ou une table, une ligne par boite :
--   prendre_verrou_tri(boite, par, duree_s) : prend le verrou s'il est libre, ou si la prise
--     precedente date de plus de `duree_s` secondes (passage mort sans le rendre : fonction
--     coupee au bout de 60 s), ou s'il est deja a `par`. En une instruction (insert ... on
--     conflict do update ... where) : deux appels simultanes ne peuvent pas l'obtenir tous
--     les deux. Rend true si le verrou est pris.
--   liberer_verrou_tri(boite, par) : rend le verrou, seulement s'il est encore a `par`.
--
-- Les gestes de l'ecran (ranger, supprimer, annuler) ne prennent PAS ce verrou : ils sont
-- proteges par la ligne de journal « en_cours » et l'index unique (intranet_tri_journal_etat.sql).
--
-- SANS CE FICHIER L'APP TOURNE comme avant : pas de verrou, signale une fois par instance.
--
-- RLS activee sans policy ; fonctions reservees a service_role.

create table if not exists public.intranet_tri_verrou (
  boite   text primary key,                 -- ex. syndic4@real31.fr
  pris_le timestamptz not null default now(),
  par     text not null                     -- identifiant du passage qui le tient
);

alter table public.intranet_tri_verrou enable row level security;

create or replace function public.prendre_verrou_tri(p_boite text, p_par text, p_duree_s integer)
returns boolean
language sql
security definer
set search_path = public
as $$
  with pris as (
    insert into intranet_tri_verrou as v (boite, pris_le, par)
    values (p_boite, now(), p_par)
    on conflict (boite) do update
      set pris_le = excluded.pris_le,
          par = excluded.par
      where v.pris_le < now() - make_interval(secs => p_duree_s)
         or v.par = p_par
    returning 1
  )
  select exists (select 1 from pris);
$$;

create or replace function public.liberer_verrou_tri(p_boite text, p_par text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from intranet_tri_verrou where boite = p_boite and par = p_par;
$$;

revoke all on function public.prendre_verrou_tri(text, text, integer) from public, anon, authenticated;
grant execute on function public.prendre_verrou_tri(text, text, integer) to service_role;
revoke all on function public.liberer_verrou_tri(text, text) from public, anon, authenticated;
grant execute on function public.liberer_verrou_tri(text, text) to service_role;

-- Controle : la table (RLS activee) et les 2 fonctions.
select tablename, rowsecurity
  from pg_tables
 where schemaname = 'public'
   and tablename = 'intranet_tri_verrou';

select proname
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('prendre_verrou_tri', 'liberer_verrou_tri')
 order by proname;
