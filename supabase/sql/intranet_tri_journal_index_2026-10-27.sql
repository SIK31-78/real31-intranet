-- TRI DES E-MAILS : index de lecture du journal et de l'etat de « Mes e-mails » (ADR-046,
-- revision du 27/10/2026).
--
-- A executer une fois dans le SQL editor Supabase de la base cible, apres
-- intranet_tri_emails.sql et intranet_tri_journal_cle.sql. Idempotent.
--
-- POURQUOI : depuis le 27/10/2026 l'app ne relit plus tout le journal pour filtrer en memoire
-- (plafond de 500 lignes qui faisait disparaitre les mails anciens des binomes) ; elle filtre
-- en base, par petites requetes repetees a chaque affichage et a chaque passage de la tache
-- planifiee (toutes les 5 min) :
--
--   (boite, internet_message_id)
--       dejaRanges / dejaJournalises : « ces 100 mails de la reception ont-ils deja une
--       ligne ? », par lots de 50 identifiants, a chaque rendu de /tri-emails et a chaque
--       passage du cron ; rangementActif : la ligne en cours d'UN mail (correction de copro
--       depuis « Mes e-mails », « Pas pour moi »). L'index existant
--       intranet_tri_journal_message_idx n'a que internet_message_id, filtre sur annule_le :
--       il ne sert pas a dejaJournalises (lignes annulees comprises), ni au filtre par boite.
--
--   (boite, dossier_cle, fait_le desc) where annule_le is null
--       journalPourCles : les rangements vers MES dossiers de binome sur 45 jours, a chaque
--       ouverture de « Mes e-mails ». Partiel : seules les lignes actives sont distribuees.
--
--   intranet_mes_emails_etat (email_id)
--       l'etat des mails affiches (lu, repondu, classe) est relu par lot d'email_id (`in`),
--       a chaque ouverture de « Mes e-mails » ; seul (gestionnaire_id) etait indexe.

create index if not exists intranet_tri_journal_boite_message_idx
  on public.intranet_tri_journal (boite, internet_message_id);

create index if not exists intranet_tri_journal_boite_dossier_idx
  on public.intranet_tri_journal (boite, dossier_cle, fait_le desc)
  where annule_le is null;

create index if not exists intranet_mes_emails_etat_email_idx
  on public.intranet_mes_emails_etat (email_id);

-- Controle
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
   and indexname in ('intranet_tri_journal_boite_message_idx', 'intranet_tri_journal_boite_dossier_idx', 'intranet_mes_emails_etat_email_idx')
 order by indexname;
