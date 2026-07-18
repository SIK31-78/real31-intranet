-- Table native intranet : memoire des evenements Outlook DERIVES d'une date d'AG
-- (demande Sekou 2026-07-17). Vit dans le schema public de la base patron
-- (lgrsnrclufsulglbwcqi), comme les autres tables natives intranet_*.
--
-- Quand une date d'AG est posee, deux creneaux de travail sont projetes dans l'agenda
-- du gestionnaire :
--   MISE_SOUS_PLI    "S024 - Mise sous pli"     J-31 (jalon CONVOC)           10h-12h
--   RELANCE_DATE_AG  "S024 - RELANCE DATE AG"   J-7  (jalon RELANCE_POUVOIRS) 10h-10h30
-- Deplacer l'AG DEPLACE ces evenements ; effacer la date les supprime.
--
-- POURQUOI la cle est (copro_code, role) et NON (copro_code, ag_date, role) :
-- la date d'AG ne fait PAS partie de l'identite du creneau. Si elle y etait, deplacer
-- une AG du 15 au 22 changerait la cle -> nouvelle ligne, et l'evenement Outlook du 15
-- resterait ORPHELIN (il vit dans Outlook, l'app ne saurait plus qu'il existe) : doublon
-- dans l'agenda. C'est exactement le bug corrige sur la projection AG/CS. Avec
-- (copro_code, role), on retrouve toujours LE meme evenement et on le PATCHe.
--
-- A executer une fois dans le SQL editor Supabase de la base cible.
-- Pas de contrainte FK vers public."Copropriete" : reference logique seulement, pour ne
-- rien imposer aux tables de l'App A (minimise le risque de drift Prisma).
-- Tant que la table n'existe pas, la fonctionnalite est inerte (lecture vide, ecriture
-- non memorisee -> l'evenement cree est supprime dans la foulee, jamais de doublon) :
-- l'app fonctionne comme avant.

create table if not exists public.intranet_projections_outlook (
  copro_code       text not null,                       -- code affiche de la copro, ex 'S024'
  role             text not null
                   check (role in ('MISE_SOUS_PLI','RELANCE_DATE_AG')),
  outlook_event_id text,                                -- id Graph de l'evenement projete
  outlook_boite    text,                                -- email de l'agenda ou il vit
  updated_at       timestamptz default now(),
  primary key (copro_code, role)
);

-- RLS activee sans policy : acces via service_role uniquement (comme les autres tables
-- intranet). Le cloisonnement gestionnaire est applique en code (managerId).
alter table public.intranet_projections_outlook enable row level security;

comment on table public.intranet_projections_outlook is
  'Memoire des evenements Outlook derives d''une date d''AG (creneaux Mise sous pli J-31 et RELANCE DATE AG J-7). Cle (copro_code, role) SANS la date : deplacer l''AG deplace le meme evenement au lieu d''en creer un second.';
