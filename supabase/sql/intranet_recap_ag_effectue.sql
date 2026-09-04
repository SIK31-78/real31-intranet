-- Marquage « effectué » d'un récap AG, côté GESTIONNAIRE (demande des collègues, 2026-09-04).
-- A executer dans le SQL editor Supabase (base patron).
-- Re-executable sans risque (add column if not exists).

-- ============================================================================
-- Pourquoi deux colonnes de plus, et pas une reutilisation de l'existant
-- ============================================================================
-- L'ecran « Récap AG » liste les recaps enregistres, et rien ne disait ce qui
-- avait deja ete fait derriere : le gestionnaire relisait la meme liste a chaque
-- fois sans savoir ou il s'etait arrete. D'ou un marqueur explicite.
--
-- Ce marqueur est DISTINCT de `traite_compta_at` / `traite_compta_par`
-- (intranet_recap_ag_traitement.sql). Deux boucles, deux metiers :
--
--   traite_compta_at = la COMPTABILITE a saisi (budget vote, appels de fonds,
--                      cycle de contrat). C'est la file « Récaps d'AG reçus ».
--   effectue_at      = le GESTIONNAIRE a fini ce qu'IL avait a faire apres l'AG.
--
-- Les fusionner ferait disparaitre un recap de la file du comptable des qu'un
-- gestionnaire le classe - exactement l'inverse du besoin. Et detourner
-- `notif_comptable_at` (envoi de mail, jamais branche) melangerait un troisieme
-- fait encore different.
--
--   effectue_at  = horodatage du marquage ; NULL = reste a faire.
--   effectue_par = initiales de celui qui a marque (tracabilite, comme cree_par).
--
-- Le code fonctionne SANS ces colonnes : l'historique se relit en degradation
-- (tout apparait « à faire »), et le bouton remonte une erreur explicite nommant
-- ce fichier plutot que de reussir a vide.

alter table public.intranet_recap_ag
  add column if not exists effectue_at timestamptz;

alter table public.intranet_recap_ag
  add column if not exists effectue_par text;

-- Les recaps restant a faire, les plus recents d'abord : c'est la requete de l'ecran.
create index if not exists intranet_recap_ag_effectue_idx
  on public.intranet_recap_ag (effectue_at, created_at desc);

-- Controle.
select
  count(*)                                       as recaps,
  count(*) filter (where effectue_at is null)    as a_faire,
  count(*) filter (where effectue_at is not null) as effectues
from public.intranet_recap_ag;
