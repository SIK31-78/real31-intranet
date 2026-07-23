-- Facturation de gestion courante trimestrielle (demande Sekou, 2026-07-22).
-- A executer dans le SQL editor Supabase (base suivi-contrats-copros).
-- Re-executable sans risque.

-- 1. Nouveau type de prestation : gestion_courante.
alter table public.intranet_factures
  drop constraint if exists intranet_factures_type_prestation_check;

alter table public.intranet_factures
  add constraint intranet_factures_type_prestation_check
  check (type_prestation in (
    'depassement_cs',
    'suivi_travaux',
    'suivi_sinistre',
    'pre_etat_date',
    'etat_date',
    'depassement_ag',
    'gestion_courante'
  ));

-- 2. Periode de facturation (ex "2026-T3"). Renseignee uniquement pour la
--    gestion courante ; sert a ne pas facturer deux fois le meme trimestre.
alter table public.intranet_factures
  add column if not exists periode text;

-- Idempotence : on retrouve vite si une copro a deja ete facturee pour un trimestre.
create index if not exists intranet_factures_gestion_courante_idx
  on public.intranet_factures (copropriete_id, periode)
  where type_prestation = 'gestion_courante';
