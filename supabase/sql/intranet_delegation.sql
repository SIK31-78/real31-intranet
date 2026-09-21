-- Délégations d'écriture (ADR-041, 21/09/2026) : « Delphine → Dimitri, du 1er octobre au
-- 31 mars, congé maternité ». Le bénéficiaire écrit sur le portefeuille du titulaire, sur
-- une agence, ou sur une copro, entre deux dates. Posée par le titulaire ou la direction
-- de son agence, visible dans Collaborateurs. Le code se passe de la table si elle manque
-- (aucune délégation), comme les autres tables intranet_*.
-- RLS laissée off comme le reste de public (service_role).

create table if not exists public.intranet_delegation (
  id          uuid primary key default gen_random_uuid(),
  de_user_id  text not null,                 -- public."User".id du titulaire
  a_user_id   text not null,                 -- public."User".id du bénéficiaire
  portee      text not null check (portee in ('portefeuille', 'agence', 'copro')),
  agence      text,                          -- code d'agence si portee = agence
  copro_code  text,                          -- code de copro si portee = copro
  depuis      date not null default current_date,
  jusqua      date,                          -- null = sans fin
  motif       text,
  cree_par    text not null,
  created_at  timestamptz not null default now(),
  cloture_le  timestamptz,                   -- retirée avant terme
  cloture_par text,
  check (portee <> 'agence' or agence is not null),
  check (portee <> 'copro' or copro_code is not null),
  check (jusqua is null or jusqua >= depuis)
);

create index if not exists intranet_delegation_a_user_idx on public.intranet_delegation (a_user_id) where cloture_le is null;
create index if not exists intranet_delegation_de_user_idx on public.intranet_delegation (de_user_id) where cloture_le is null;
