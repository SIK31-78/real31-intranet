-- Table native intranet : fil de notes du pole compta (aller-retour gestionnaire <->
-- comptable autour de la preparation des comptes d'une AG). But : que les questions de
-- la comptable et les reponses du gestionnaire vivent dans l'intranet (et ne se perdent
-- plus apres le CS). Vit dans le schema public de la base patron (tables natives dans
-- public). A executer une fois dans le SQL editor Supabase.
--
-- 1 ligne = 1 note du fil, cle logique par (copropriete_id, ag_date).
--   - auteur     = 'comptable' | 'gestionnaire' (qui a ecrit ; determine par le contexte,
--                  vue compta vs fiche gestionnaire - pas de vraie auth par note).
--   - resolu     = note traitee (point regle), ne reste plus "a faire".
--   - marque_par = initiales / nom de qui a ecrit ou marque la note.
--
-- Les 2 FLAGS compta (comptes_verifies, envoyer_avant) ET la CHECKLIST de postes
-- (champ_id 'compta.check.<slug>') ne sont PAS ici : ils vivent dans la table generique
-- cle/valeur public.intranet_odj_champs (aucune table dediee cote checklist).
--
-- Pas de FK vers public."Copropriete" (reference logique, evite le drift Prisma). RLS OFF
-- (le service_role passe de toute facon ; aligne sur les tables soeurs natives).

create table if not exists public.intranet_compta_notes (
  id              uuid primary key default gen_random_uuid(),
  copropriete_id  text not null,
  ag_date         date not null,
  auteur          text not null,
  texte           text not null,
  resolu          boolean not null default false,
  marque_par      text,
  created_at      timestamptz not null default now()
);

create index if not exists intranet_compta_notes_ag_idx
  on public.intranet_compta_notes (copropriete_id, ag_date);
