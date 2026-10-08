-- TRI DES E-MAILS : la cle du dossier et les etiquettes dans le journal (ADR-046, REA-29/30).
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
--
-- ET LES ETIQUETTES : un mail peut porter plusieurs codes copro (factures d'un prestataire
-- pour plusieurs copropriétés, demande de Sekou du 08/10/2026). copro_reference garde la
-- copro principale (mesure des signaux), copros toutes les etiquettes posees.

alter table public.intranet_tri_journal
  add column if not exists dossier_cle text,
  add column if not exists copros text[] not null default '{}';

-- Les lignes existantes : leur copro devient leur seule etiquette.
update public.intranet_tri_journal
  set copros = array[copro_reference]
  where copro_reference is not null and copros = '{}';

-- Controle
select count(*) as lignes, count(dossier_cle) as avec_cle from public.intranet_tri_journal;
