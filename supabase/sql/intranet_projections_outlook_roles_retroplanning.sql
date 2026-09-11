-- Retroplanning AG revu le 2026-09-11 (Sekou) : deux creneaux de travail s'ajoutent a
-- "Mise sous pli". La contrainte CHECK sur `role` les refuse tant que ce SQL n'est pas
-- passe (verifie sur la base : insert 'PREPARER_ODJ' -> 23514).
--
--   PREPARER_ODJ     "S024 - Préparer l'ODJ du CS"    J-49 (jalon ODJ_PREP)  10h-12h
--   VALIDER_ODJ_AG   "S024 - ODJ de l'AG à valider"   J-35 (jalon ODJ_CS)    09h-09h30
--   MISE_SOUS_PLI    "S024 - Mise sous pli"           J-31 (jalon CONVOC)    10h-12h
--
-- RELANCE_DATE_AG n'est plus produit depuis le 2026-09-04 mais reste AUTORISE : des
-- lignes existent encore en base et doivent rester lisibles et supprimables.
--
-- SANS ce SQL, l'app ne casse pas : la memorisation echoue, le service supprime dans la
-- foulee l'evenement qu'il vient de creer (anti-doublon deja en place) et se contente
-- d'un warn. Les deux nouveaux creneaux ne sont simplement pas poses dans l'agenda.
--
-- A executer une fois dans le SQL editor Supabase de la base cible. Idempotent.

alter table public.intranet_projections_outlook
  drop constraint if exists intranet_projections_outlook_role_check;

alter table public.intranet_projections_outlook
  add constraint intranet_projections_outlook_role_check
  check (role in ('PREPARER_ODJ', 'VALIDER_ODJ_AG', 'MISE_SOUS_PLI', 'RELANCE_DATE_AG'));

comment on table public.intranet_projections_outlook is
  'Memoire des evenements Outlook derives d''une date d''AG (creneaux Preparer l''ODJ du CS J-49, ODJ de l''AG a valider J-35, Mise sous pli J-31). Cle (copro_code, role) SANS la date : deplacer l''AG deplace le meme evenement au lieu d''en creer un second.';
