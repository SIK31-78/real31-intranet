-- TRI DES E-MAILS : la cle du dossier dans le journal (ADR-046, REA-29/30).
--
-- A executer une fois dans le SQL editor Supabase, apres intranet_tri_emails.sql.
-- Idempotent.
--
-- POURQUOI : quand quelqu'un glisse un mail a la main dans Outlook, l'app le retrouve et
-- compare son dossier actuel a celui ou elle l'avait range. Le NOM du dossier ne suffit
-- pas (il change quand l'assistant change) : il faut la cle stable du dossier
-- ('binome:<gestionnaire>', 'binome:<id>', 'comptabilite', 'divers'), la meme que dans
-- intranet_tri_dossier. Les lignes deja ecrites gardent une cle vide : elles ne sont
-- simplement pas verifiees.

alter table public.intranet_tri_journal
  add column if not exists dossier_cle text;

-- Controle
select count(*) as lignes, count(dossier_cle) as avec_cle from public.intranet_tri_journal;
