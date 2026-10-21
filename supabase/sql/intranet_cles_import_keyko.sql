-- Reprise Keyko Manager (REA-53, ADR-049) : les trousseaux et les entreprises repris d'Asnières
-- portent la source « import_keyko », comme ceux de LGC portent « import_powerapps ».
-- À passer AVANT `node scripts/import-cles-keyko.mjs --dump ... --ecrire` (le dry-run tourne sans).
-- Rejouable.

alter table public.intranet_cles_trousseau drop constraint if exists intranet_cles_trousseau_source_check;
alter table public.intranet_cles_trousseau add constraint intranet_cles_trousseau_source_check
  check (source in ('intranet', 'import_powerapps', 'import_keyko'));

alter table public.intranet_cles_entreprise drop constraint if exists intranet_cles_entreprise_source_check;
alter table public.intranet_cles_entreprise add constraint intranet_cles_entreprise_source_check
  check (source in ('intranet', 'import_powerapps', 'import_keyko'));

-- Le commentaire de la table des biens citait l'ancien numéro d'ADR.
comment on table public.intranet_bien is
  'Bien hors syndic (location, transaction) : adresse, propriétaire, digicode. La copropriété, elle, vit dans ESTALE. ADR-049.';

-- Contrôle :
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname in ('intranet_cles_trousseau_source_check', 'intranet_cles_entreprise_source_check');   -- 2 lignes, avec import_keyko
