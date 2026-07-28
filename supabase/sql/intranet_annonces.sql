-- Table native intranet : ANNONCES du reseau (direction) affichees sur l'accueil de tous
-- les collaborateurs, pilotees depuis /admin/annonces (super-admin).
--
-- A executer une fois dans le SQL editor Supabase de la base cible.
--
-- Correspond EXACTEMENT a ce que lit/ecrit l'adapter
-- src/lib/adapters/supabase/supabase-annonce-repository.ts :
--   SELECT id, titre, corps, niveau, actif, auteur_email, auteur_initiales, created_at, updated_at
--   INSERT titre, corps, niveau, actif, auteur_email, auteur_initiales
--   UPDATE titre / corps / niveau / actif / updated_at
--   DELETE by id
--
-- Pas de FK vers public."User" : reference logique par auteur_email (comme les autres
-- tables intranet_*). RLS laissee off (comme le reste de public) ; l'intranet lit/ecrit
-- via la cle service_role, le cloisonnement (super-admin pour l'ecriture) est en CODE.

create table if not exists public.intranet_annonces (
  id                uuid primary key default gen_random_uuid(),
  titre             text not null,
  corps             text,                                       -- detail optionnel
  niveau            text not null default 'info'
                    check (niveau in ('info','important')),
  actif             boolean not null default true,              -- visible sur l'accueil ? false = brouillon/retiree
  agences           text[],                                     -- CIBLE agences (codes ML/LGC/HLS/ASN) ; null = pas de filtre agence
  emails            text[],                                     -- CIBLE collaborateurs (emails) ; null = pas de filtre email
  auteur_email      text,                                       -- ref logique = public."User".email
  auteur_initiales  text,                                       -- ex 'SK' (affichage admin)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz                                 -- touche a chaque edition
);

-- Accueil : les annonces actives, plus recentes d'abord.
create index if not exists intranet_annonces_actif_idx
  on public.intranet_annonces (actif, created_at desc);

-- Idempotent : CIBLAGE des annonces (2026-07-28, demande Sekou) - par agence(s), par
-- collaborateur(s), ou tout le groupe (les deux colonnes null/vides). Le filtre est
-- applique EN CODE (domaine annonceVisiblePour), la table ne porte que la cible.
alter table public.intranet_annonces add column if not exists agences text[];
alter table public.intranet_annonces add column if not exists emails text[];
