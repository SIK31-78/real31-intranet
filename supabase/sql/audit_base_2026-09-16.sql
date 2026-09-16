-- Audit de la base du 16/09/2026 (lot C) : index et contraintes d'unicité.
-- À passer à la main dans l'éditeur SQL Supabase (RLS laissée off comme le reste de public).
-- Vérifié avant écriture : aucun doublon dans intranet_factures (74 lignes) ni dans
-- intranet_suivi_contrats (516 lignes), les index uniques passent sans nettoyage.

-- 1. Registre national (85 564 lignes) : la recherche fait `ilike '%mot%'` et `imatch`.
--    L'index gin sur to_tsvector ne sert qu'à l'opérateur @@, jamais utilisé : chaque frappe
--    de l'autocomplétion scannait toute la table. Un index trigram sert les deux opérateurs.
create extension if not exists pg_trgm;
create index if not exists intranet_registre_copros_recherche_trgm_idx
  on public.intranet_registre_copros using gin (recherche gin_trgm_ops);
drop index if exists public.intranet_registre_copros_recherche_idx;

-- 2. Une seule facture par copropriété, prestation et période (gestion courante trimestrielle) :
--    la garde anti-doublon n'était qu'applicative, un retry après timeout pouvait facturer deux fois.
create unique index if not exists intranet_factures_dedup_idx
  on public.intranet_factures (copropriete_id, type_prestation, periode)
  where periode is not null;

-- 3. Un seul cycle de contrat par copropriété et date de début : un retry d'élection ou de récap
--    AG insérait un second cycle, et « le dernier contrat » devenait non déterministe.
create unique index if not exists intranet_suivi_contrats_copro_debut_idx
  on public.intranet_suivi_contrats (copropriete_id, debut_contrat);

-- 4. Historique d'une copro par immatriculation (rattachement des propositions) : index d'expression.
create index if not exists intranet_proposition_immat_idx
  on public.intranet_proposition ((immeuble->>'immatriculation'));
