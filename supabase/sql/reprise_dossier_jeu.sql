-- Ajout de la colonne `jeu` a public.reprise_dossier (module "Reprise de copro").
--
-- A EXECUTER A LA MAIN une seule fois dans le SQL editor Supabase (base PARTAGEE du
-- patron). Deploy-only : jamais de `migrate reset` / `db reset` sur cette base.
--
-- But : PERSISTER le jeu de donnees extrait par l'analyse (lots / cles / tantiemes /
-- owners / attributions) pour rehydrater la fiche du dossier A L'OUVERTURE, sans avoir a
-- re-analyser (extraction couteuse). Le domaine src/lib/reprise/domain/patrimoine.ts
-- (type JeuDeDonnees) fait foi pour la forme :
--   jeu : { lots: [...], cles: [...], tantiemes: [...], owners: [...], attributions: [...] }
--
-- Degradation propre : tant que cette colonne n'existe pas, l'adapter Supabase la traite
-- en no-op (ecriture rejouee sans `jeu`, lecture -> undefined). L'analyse marche donc AVANT
-- meme d'avoir lance cet ALTER ; le detail du jeu n'est simplement pas conserve entre deux
-- sessions tant que la colonne manque. Une fois l'ALTER passe, la persistance est active.
--
-- La colonne peut etre volumineuse (patrimoine complet d'une copro) : JSONB assume.

alter table public.reprise_dossier add column if not exists jeu jsonb;

comment on column public.reprise_dossier.jeu is
  'Jeu de donnees patrimoine extrait par l''analyse (JeuDeDonnees : lots/cles/tantiemes/owners/attributions). Persiste pour rehydrater la fiche sans re-analyser. Null tant qu''aucune analyse.';
