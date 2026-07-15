-- ALTER separe (increment 2 "dates CS/AG", volet mode de reunion) : ajoute la colonne
-- du mode de tenue (visio / presentiel / hybride) a la table
-- intranet_confirmations_evenement, DEJA DEPLOYEE.
--
-- A executer UNE FOIS dans le SQL editor Supabase de la base cible (base patron
-- lgrsnrclufsulglbwcqi). Deploy-only : le code degrade proprement TANT QUE cet ALTER
-- n'est pas lance (l'adapter relit sans cette colonne via un fallback en cascade,
-- l'ecriture du mode est un no-op silencieux ; date / heure / statut / salle restent
-- la source, l'UI n'est jamais bloquee). Idempotent (add column if not exists) :
-- rejouable sans risque.
--
--   mode_reunion : 'visio' | 'presentiel' | 'hybride' (NULL = non precise)
--
-- Pas de contrainte CHECK : le domaine valide deja la valeur (liste fermee ModeReunion),
-- et un CHECK ferait echouer l'ecriture au lieu de degrader si une valeur inattendue
-- arrivait un jour. NULL reste la valeur "non precise" par defaut.

alter table public.intranet_confirmations_evenement
  add column if not exists mode_reunion text;
