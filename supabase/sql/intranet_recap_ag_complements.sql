-- Complements au recap AG (demandes Sekou, 2026-07-21).
-- A executer dans le SQL editor Supabase (base suivi-contrats-copros).
-- Re-executable sans risque (add column if not exists).

-- ============================================================================
-- 1. Numero de resolution sur les travaux votes
-- ============================================================================
-- Chaque poste de travaux vote en AG correspond a une resolution numerotee du
-- proces-verbal. Le noter ici permet de relier la facturation et l'appel de
-- fonds a la resolution qui les autorise.

alter table public.intranet_recap_ag_travaux
  add column if not exists numero_resolution text;

-- ============================================================================
-- 2. Nature des frais postaux : reels ou forfait
-- ============================================================================
-- Le contrat de gestion prevoit soit une refacturation des frais postaux REELS,
-- soit un FORFAIT annuel. Sans ce drapeau, un forfait absent serait
-- indistinguable d'un forfait non renseigne, alors que les deux menent a des
-- facturations differentes.
--
-- Equivalent de Copropriete.realPostalFees cote App A (booleen : true = frais
-- reels). On le porte ici parce que c'est une clause du CONTRAT, qui peut donc
-- changer d'un cycle a l'autre, la ou la fiche copro ne garde que l'etat courant.
--   true  = frais reels (forfait_postaux_ttc reste NULL)
--   false = forfait     (montant dans forfait_postaux_ttc)
--   NULL  = non renseigne (contrats repris automatiquement)

alter table public.intranet_suivi_contrats
  add column if not exists frais_postaux_reels boolean;

-- Controle.
select
  count(*) filter (where frais_postaux_reels is true)  as frais_reels,
  count(*) filter (where frais_postaux_reels is false) as forfait,
  count(*) filter (where frais_postaux_reels is null)  as non_renseigne
from public.intranet_suivi_contrats;
