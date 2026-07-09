-- ALTER separe (increment 4 "reservation de salle") : ajoute les colonnes de
-- ressources reservees a la table intranet_confirmations_evenement, DEJA DEPLOYEE.
--
-- A executer UNE FOIS dans le SQL editor Supabase de la base cible (base patron
-- lgrsnrclufsulglbwcqi). Deploy-only : le code degrade proprement TANT QUE cet ALTER
-- n'est pas lance (l'adapter relit sans ces colonnes, l'ecriture des ressources est
-- un no-op silencieux ; date / heure / statut restent la source, l'UI n'est jamais
-- bloquee). Idempotent (add column if not exists) : rejouable sans risque.
--
--   salle_email    : email de la salle reservee (room mailbox de RESSOURCES_REAL31)
--   vehicule_email : email du vehicule reserve (la ZOE), pour une AG a l'exterieur
--
-- NB : les room mailboxes doivent aussi etre ajoutees au groupe de l'Application Access
-- Policy Exchange (cote DSI) pour que getSchedule (verif dispo) et la reservation
-- fonctionnent - sinon la dispo reste "inconnue" et la salle n'auto-accepte pas.

alter table public.intranet_confirmations_evenement
  add column if not exists salle_email text;

alter table public.intranet_confirmations_evenement
  add column if not exists vehicule_email text;
