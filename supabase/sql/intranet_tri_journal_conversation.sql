-- TRI DES E-MAILS : la conversation Graph de chaque rangement (historique du tri).
--
-- A executer une fois dans le SQL editor Supabase, apres intranet_tri_emails.sql.
-- Idempotent.
--
-- POURQUOI (decision Sekou du 19/10/2026) : quand un mail d'une conversation deja rangee
-- arrive, le tri propose la copro de ce rangement en piste FAIBLE (jamais sure). Seulement
-- la meme conversation : pas d'historique par expediteur ni par numero de dossier.
-- Les lignes deja ecrites gardent une conversation vide : elles ne servent pas d'historique.
--
-- Tant que ce fichier n'est pas passe, l'app range sans la colonne et lit sans historique.

alter table public.intranet_tri_journal
  add column if not exists conversation_id text;

-- Lecture par lot de conversations, a chaque affichage de la file.
create index if not exists intranet_tri_journal_conversation_idx
  on public.intranet_tri_journal (boite, conversation_id, fait_le desc)
  where annule_le is null and conversation_id is not null;

-- Controle
select count(*) as lignes, count(conversation_id) as avec_conversation from public.intranet_tri_journal;
