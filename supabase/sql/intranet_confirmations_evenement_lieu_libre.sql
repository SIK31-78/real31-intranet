-- ALTER separe (REA-148, 12/10/2026) : reunion AG / CS « à l'extérieur du cabinet ».
-- Ajoute la colonne du LIEU LIBRE (adresse saisie a la main : salle louee, loge,
-- salle municipale...) a la table intranet_confirmations_evenement, DEJA DEPLOYEE.
--
-- A executer UNE FOIS dans le SQL editor Supabase de la base cible (base patron
-- lgrsnrclufsulglbwcqi). Deploy-only : le code degrade proprement TANT QUE cet ALTER
-- n'est pas lance (l'adapter relit sans cette colonne via la cascade de colonnes,
-- l'ecriture du lieu est un no-op ; la date, la salle et le mode restent enregistres).
-- Idempotent (add column if not exists) : rejouable sans risque.
--
--   lieu_libre : texte libre (200 caracteres max cote code), NULL = pas de lieu exterieur.
--                Exclusif d'une salle REAL31 (salle_email) : le code n'enregistre jamais
--                les deux a la fois.

alter table public.intranet_confirmations_evenement
  add column if not exists lieu_libre text;
