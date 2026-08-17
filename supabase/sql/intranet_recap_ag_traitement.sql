-- Suivi du traitement comptable d'un recap AG (demande Sekou, 2026-08-17).
-- A executer dans le SQL editor Supabase (base patron).
-- Re-executable sans risque (add column if not exists).

-- ============================================================================
-- Pourquoi ces deux colonnes
-- ============================================================================
-- Le recap d'AG sert deux choses. La facturation du depassement horaire (deja en
-- place) et, surtout, la NOTE DE TRAVAIL du comptable : c'est a partir du recap
-- qu'il saisit le budget vote, le pourcentage de fonds travaux, les appels de
-- fonds des travaux votes, et qu'il ouvre le nouveau cycle de contrat.
--
-- Jusqu'ici le recap etait ecrit en base et personne ne le lisait. La file
-- « Recaps d'AG recus » de l'espace comptable le remet dans le circuit ; il lui
-- manquait de quoi FERMER la boucle : savoir ce qui a ete traite, par qui, et
-- quand. Sans marqueur, la file grossit sans fin et le comptable repasse sur
-- les memes recaps.
--
-- A NE PAS confondre avec `notif_comptable_at`, deja presente sur la table :
-- elle trace l'ENVOI D'UN MAIL au comptable (flow NotifComptable jamais branche,
-- et qu'on ne branchera pas - decision Sekou : la file EST le canal). La
-- detourner melangerait « le comptable a ete prevenu » et « le comptable a
-- traite », qui sont deux faits differents.
--
--   traite_compta_at  = horodatage du marquage ; NULL = a traiter.
--   traite_compta_par = initiales de celui qui a marque (tracabilite, comme
--                       cree_par sur la meme table).
--
-- Le code fonctionne SANS ces colonnes : la file les lit en degradation (tout
-- apparait « a traiter »), et le bouton « marquer traite » remonte une erreur
-- explicite nommant ce fichier plutot que de reussir a vide.

alter table public.intranet_recap_ag
  add column if not exists traite_compta_at timestamptz;

alter table public.intranet_recap_ag
  add column if not exists traite_compta_par text;

-- Les recaps a traiter, les plus recents d'abord : c'est la requete de la file.
create index if not exists intranet_recap_ag_traitement_idx
  on public.intranet_recap_ag (traite_compta_at, created_at desc);

-- Controle.
select
  count(*)                                          as recaps,
  count(*) filter (where traite_compta_at is null)  as a_traiter,
  count(*) filter (where traite_compta_at is not null) as traites
from public.intranet_recap_ag;
