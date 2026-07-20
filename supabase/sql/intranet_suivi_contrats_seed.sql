-- Peuplement initial de public.intranet_suivi_contrats depuis les donnees
-- existantes de public."Copropriete" (App A).
--
-- Pourquoi : la table est vide, et sans contrat aucune annee de bareme ne peut
-- etre resolue -> toute facturation echoue. Les contrats historiques vivaient
-- dans la liste SharePoint « Suivi des contrats copro », non reprise a ce jour.
--
-- Deduction : `syndicContractEndDate` porte la FIN du contrat courant. Le contrat
-- courant a donc demarre un an plus tot, au lendemain de la fin du precedent
-- (regle du flow legacy : DebutContrat = DateSyndicFinContrat + 1 jour).
--   debut_contrat = syndicContractEndDate - 1 an + 1 jour
-- Ex. fin 2026-06-30 -> debut 2025-07-01 -> bareme 2025.
--
-- NOTE : tous les contrats ne finissent PAS le 30/06 (releve : des 31/12, des
-- 31/03). La formule reste valable : elle ne suppose qu'une duree d'un an, pas
-- un mois de debut fixe.
--
-- honoraires_gestion_ttc / forfait_postaux_ttc restent NULL : ces montants
-- n'existent pas dans "Copropriete" (`realPostalFees` y est un BOOLEEN, pas un
-- montant). Ils ne servent qu'a la facturation de gestion courante trimestrielle,
-- non encore portee. A completer lors de la reprise de la liste SharePoint.
--
-- Re-executable sans risque : une copro deja pourvue d'un contrat est ignoree.
-- A executer dans le SQL editor Supabase (base suivi-contrats-copros).

insert into public.intranet_suivi_contrats (copropriete_id, debut_contrat)
select
  c."referenceCrypto",
  (c."syndicContractEndDate"::date - interval '1 year' + interval '1 day')::date
from public."Copropriete" c
where c.status = 'ACTIVE'
  and c."syndicContractEndDate" is not null
  and c."referenceCrypto" is not null
  and not exists (
    select 1
    from public.intranet_suivi_contrats s
    where s.copropriete_id = c."referenceCrypto"
  );

-- Controle : repartition des annees de bareme ainsi obtenues.
-- (Les annees hors 2025/2026 n'ont pas de grille tarifaire complete ; une
--  facturation sur ces copros levera une erreur explicite, c'est voulu.)
select
  extract(year from debut_contrat) as annee_bareme,
  count(*) as nb_copros
from public.intranet_suivi_contrats
group by 1
order by 1;
