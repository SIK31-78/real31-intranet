-- ANNUAIRE DES EXPEDITEURS CRYPTO, synchronise chaque nuit (REA-291, ADR-046).
--
-- A executer une fois dans le SQL editor Supabase de la base cible
-- (lgrsnrclufsulglbwcqi), comme le reste de supabase/sql/. Idempotent.
--
-- POURQUOI : pour proposer la copro d'un mail venu d'une copro Crypto, il faut savoir qui
-- ecrit. Crypto le sait pour 94 % des mails grace aux adresses de ses fiches (Tiers) et
-- de leurs correspondants. L'export Crypto quotidien du patron (OneDrive « Technique »)
-- est relu chaque nuit par scripts/sync-annuaire-crypto.mjs, sur le PC de Sekou, et
-- remplace l'annuaire en entier : les adresses changees ou supprimees disparaissent aussi.
-- intranet_crypto_contacts (import ponctuel de juillet, copropriétaires seulement) n'est
-- pas touchee : le module Mes e-mails V1 la lit encore.
--
-- RLS ACTIVEE SANS POLITIQUE : ces tables portent des adresses de particuliers. L'app et le
-- script passent par service_role, qui ignore la RLS ; la cle publique n'y lit rien.

-- 1. L'annuaire : une ligne par (adresse, fiche Crypto, copro). Une adresse peut mener a
--    plusieurs copros (copropriétaire de plusieurs lots) ou a aucune (entreprise, notaire).
create table if not exists public.intranet_crypto_annuaire (
  email      text not null,                 -- en minuscules
  tiers_id   text not null,                 -- Tiers.IdRef dans Crypto
  nom        text,                          -- Tiers.Identite, ou le nom du correspondant
  qualite    text not null check (qualite in ('coproprietaire', 'conseil_syndical', 'locataire', 'professionnel', 'autre')),
  metier     text,                          -- casquette Crypto, ex. « Entrep. Plomberie », « Notaire »
  copro_code text,                          -- notre code (referenceCrypto) ; null = aucune copro
  source     text not null check (source in ('fiche', 'correspondant'))
);
create index if not exists intranet_crypto_annuaire_email on public.intranet_crypto_annuaire (email);
alter table public.intranet_crypto_annuaire enable row level security;

-- 2. La zone de depot : le script y verse la nouvelle liste par paquets, puis la bascule
--    la recopie d'un coup. Un passage interrompu laisse l'annuaire en place.
create table if not exists public.intranet_crypto_annuaire_import (like public.intranet_crypto_annuaire);
alter table public.intranet_crypto_annuaire_import add column if not exists passage uuid not null;
alter table public.intranet_crypto_annuaire_import enable row level security;

-- 3. Le compte rendu de chaque synchro, relu par la tache planifiee qui alerte Sekou.
create table if not exists public.intranet_synchro (
  cle          text primary key,            -- 'annuaire-crypto'
  passe_le     timestamptz not null,        -- dernier passage du script, reussi ou non
  reussi_le    timestamptz,                 -- dernier passage reussi
  export_du    timestamptz,                 -- date de l'export Crypto relu au dernier succes
  statut       text not null check (statut in ('reussi', 'inchange', 'echec')),
  message      text,
  lignes       integer
);
alter table public.intranet_synchro enable row level security;

-- 4. La bascule, en une transaction : refuse une liste vide ou qui fait moins de 80 % de
--    l'annuaire en place (un export tronque ne doit pas vider l'annuaire).
create or replace function public.intranet_crypto_annuaire_basculer(p_passage uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n_nouveau integer;
  n_actuel  integer;
begin
  select count(*) into n_nouveau from intranet_crypto_annuaire_import where passage = p_passage;
  select count(*) into n_actuel from intranet_crypto_annuaire;
  if n_nouveau = 0 or n_nouveau < n_actuel * 0.8 then
    delete from intranet_crypto_annuaire_import where passage = p_passage;
    raise exception 'Annuaire refusé : % lignes reçues contre % en place (moins de 80 %%).', n_nouveau, n_actuel;
  end if;
  delete from intranet_crypto_annuaire;
  insert into intranet_crypto_annuaire (email, tiers_id, nom, qualite, metier, copro_code, source)
    select email, tiers_id, nom, qualite, metier, copro_code, source
    from intranet_crypto_annuaire_import where passage = p_passage;
  delete from intranet_crypto_annuaire_import;
  return n_nouveau;
end;
$$;
revoke all on function public.intranet_crypto_annuaire_basculer(uuid) from public, anon, authenticated;
grant execute on function public.intranet_crypto_annuaire_basculer(uuid) to service_role;

-- Controle
select
  (select count(*) from public.intranet_crypto_annuaire) as annuaire,
  (select count(*) from public.intranet_crypto_annuaire_import) as depot,
  (select count(*) from public.intranet_synchro) as synchros;
