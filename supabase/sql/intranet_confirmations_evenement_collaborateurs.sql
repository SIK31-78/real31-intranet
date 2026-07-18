-- ALTER separe (increment 4c "multi-collaborateurs") : ajoute la colonne des
-- collaborateurs associes a une reunion AG / CS a la table
-- intranet_confirmations_evenement, DEJA DEPLOYEE.
--
-- A executer UNE FOIS dans le SQL editor Supabase de la base cible (base patron
-- lgrsnrclufsulglbwcqi). Deploy-only : le code degrade proprement TANT QUE cet ALTER
-- n'est pas lance (l'adapter relit sans cette colonne via le fallback en cascade,
-- l'ecriture des collaborateurs est un no-op silencieux ; date / heure / statut /
-- salle / mode restent la source, l'UI n'est jamais bloquee). Idempotent
-- (add column if not exists) : rejouable sans risque.
--
--   collaborateurs_emails : tableau JSON des emails des collegues associes a la
--     reunion (gestionnaires du cabinet, ex. Emmanuel / Dimitri). Ils sont ajoutes
--     en attendees "required" de l'evenement Outlook projete -> il apparait dans
--     LEUR agenda, et une replanification / annulation les previent. NULL / [] = aucun.
--
-- jsonb (pas text) : PostgREST renvoie directement un tableau JS, et supabase-js
-- serialise le tableau tel quel a l'ecriture. Pas de contrainte CHECK : les emails
-- sont deja bornes cote serveur (liste fermee des gestionnaires connus, anti-injection).

alter table public.intranet_confirmations_evenement
  add column if not exists collaborateurs_emails jsonb;
