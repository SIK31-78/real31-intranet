-- REA-152 (2026-10-12) : type de dossier "Dommage-Ouvrage" (valeur 'dommage_ouvrage').
--
-- A passer a la main par Sekou dans l'editeur SQL Supabase. Idempotent : on retire la
-- contrainte CHECK sur intranet_dossiers.type puis on la repose COMPLETE, avec la nouvelle
-- valeur. Tant que ce fichier n'est pas passe, l'option "Dommage-Ouvrage" s'affiche dans le
-- formulaire mais la creation echoue cote serveur (violation de contrainte) ; les autres
-- types ne sont pas touches.
--
-- Rappel : `create table if not exists` (intranet_dossiers.sql) ne modifie jamais une
-- contrainte deja posee, d'ou ce bloc drop + add. intranet_dossiers.sql porte la meme liste,
-- les deux fichiers peuvent etre rejoues dans n'importe quel ordre.

alter table public.intranet_dossiers
  drop constraint if exists intranet_dossiers_type_check;
alter table public.intranet_dossiers
  add constraint intranet_dossiers_type_check
  check (type in ('gestion_courante','travaux','sinistre','dommage_ouvrage','impaye',
                  'procedure','recouvrement','question_diverse','autre'));

-- Verification (doit renvoyer la definition avec 'dommage_ouvrage') :
-- select pg_get_constraintdef(oid) from pg_constraint
--  where conname = 'intranet_dossiers_type_check';
