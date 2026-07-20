-- Marqueur d'edition manuelle des listes de diffusion Crypto (increment "editer la liste
-- de diffusion du conseil syndical"). A executer UNE fois dans le SQL editor Supabase de
-- la base cible (lgrsnrclufsulglbwcqi), APRES intranet_listes_diffusion.sql.
--
-- POURQUOI : la table est peuplee une fois par scripts/import-listes-diffusion.mjs
-- (upsert onConflict idref). Sans marqueur, un futur rejeu de l'import ECRASERAIT les
-- adresses editees a la main depuis l'intranet. Cette colonne distingue les deux origines :
--   edite_le IS NULL      -> la ligne vient de l'import Crypto (rejouable sans risque)
--   edite_le IS NOT NULL  -> la ligne a ete editee dans l'intranet (a NE PAS ecraser)
--
-- Cote app : l'ecriture (SupabaseListesDiffusionRepository.remplacerListeCS) pose
-- edite_le = now(). Cote import : le .mjs exclut du rejeu les idref deja edites.
--
-- IDEMPOTENT : add column if not exists -> rejouable sans erreur.

alter table public.intranet_listes_diffusion
  add column if not exists edite_le timestamptz;

comment on column public.intranet_listes_diffusion.edite_le is
  'Horodatage de la derniere edition manuelle depuis l''intranet. NULL = ligne issue de l''import Crypto (rejouable) ; non-NULL = editee a la main, a preserver du rejeu d''import.';
