-- Frais postaux AU REEL des copros ESTALE (REA-490, 03/11/2026).
--
-- L'onglet « Frais postaux » de la gestion courante refacture aux copros au reel ce
-- qu'ESTALE a facture a REAL31 pour leurs envois. Deux choses :
--
-- 1. Un type de prestation de plus dans intranet_factures : 'frais_postaux'.
-- 2. Une facture par copro et par facture ESTALE, pas deux. La periode porte la
--    reference de la facture ESTALE (ex "QXDJABFB-0001") ; l'index unique bloque un
--    second clic ou un rejeu, meme si l'ecran s'est trompe.
--
-- RLS laissée off comme le reste des intranet_*. Idempotent.

alter table public.intranet_factures
  drop constraint if exists intranet_factures_type_prestation_check;
alter table public.intranet_factures
  add constraint intranet_factures_type_prestation_check
  check (type_prestation in (
    'depassement_cs', 'suivi_travaux', 'suivi_sinistre', 'pre_etat_date', 'etat_date',
    'depassement_ag', 'gestion_courante', 'prestation_contrat', 'frais_postaux'
  ));

create unique index if not exists intranet_factures_frais_postaux_uniq
  on public.intranet_factures (copropriete_id, periode)
  where type_prestation = 'frais_postaux';
