-- Module « Contrats & contrôles » (REA-333) : suppression LOGIQUE des offres et devis.
--
-- POURQUOI. L'ancienne application « Suivi des Contrats Copros » supprimait une offre
-- d'assurance, une offre de gaz ou un devis CTQ en DUR : la seule trace restait dans son
-- AuditLog, qui devient une archive (décision 12 du plan). L'intranet garde la ligne et pose
-- `deletedAt` + `deletedById` (comme la table Document le fait déjà) : l'offre disparaît de
-- l'écran, le journal du cycle dit qui l'a retirée et quand, et une erreur de clic se répare.
-- Une offre ÉLUE ne se retire jamais (règle D13, gardée en code).
--
-- Ces colonnes vont sur les TABLES PRISMA de l'ancienne appli (noms et colonnes entre
-- guillemets, PascalCase / camelCase), gardées telles quelles (décision 5).
--
-- AVERTISSEMENT. Ces trois colonnes sont INCONNUES du `schema.prisma` de l'ancienne appli.
-- Tant qu'elle tourne, un `prisma migrate dev` chez elle verrait un drift et proposerait de
-- les retirer (voire un reset). Elle ne doit donc plus recevoir AUCUNE migration : c'est
-- prévu, elle passe en lecture seule dès que l'intranet écrit les étapes (étape 2, décision 2),
-- puis s'éteint. Le client Prisma, lui, ignore une colonne qu'il ne connaît pas : ses lectures
-- et écritures continuent de marcher, aucune panne à attendre de ce fichier.
-- Effet de bord assumé : tant que l'ancienne appli lit encore ces tables, elle affiche AUSSI
-- les offres que l'intranet a retirées (elle ne filtre pas `deletedAt`). Coexistence courte.
--
-- Rejouable : `add column if not exists`.
--
-- Sans ce fichier l'app tourne : les suppressions d'offres repartent en suppression dure
-- (le comportement de l'ancienne appli), le journal garde la trace.

alter table public."InsuranceOffer"
  add column if not exists "deletedAt"   timestamptz,
  add column if not exists "deletedById" text;         -- public."User".id (référence logique)

alter table public."GasOffer"
  add column if not exists "deletedAt"   timestamptz,
  add column if not exists "deletedById" text;

alter table public."CtqQuote"
  add column if not exists "deletedAt"   timestamptz,
  add column if not exists "deletedById" text;

comment on column public."InsuranceOffer"."deletedAt" is
  'Suppression logique posée par l''intranet (Contrats & contrôles). Null = offre visible. Colonne inconnue du schema.prisma de l''ancienne appli : ne plus y lancer de migration.';
comment on column public."GasOffer"."deletedAt" is
  'Suppression logique posée par l''intranet (Contrats & contrôles). Null = offre visible. Colonne inconnue du schema.prisma de l''ancienne appli : ne plus y lancer de migration.';
comment on column public."CtqQuote"."deletedAt" is
  'Suppression logique posée par l''intranet (Contrats & contrôles). Null = devis visible. Colonne inconnue du schema.prisma de l''ancienne appli : ne plus y lancer de migration.';

-- Index partiels : les lectures filtrent toujours sur les lignes vivantes.
create index if not exists "InsuranceOffer_tracking_vivantes_idx"
  on public."InsuranceOffer" ("insuranceTrackingId") where "deletedAt" is null;
create index if not exists "GasOffer_tracking_vivantes_idx"
  on public."GasOffer" ("gasContractTrackingId") where "deletedAt" is null;
create index if not exists "CtqQuote_copro_vivants_idx"
  on public."CtqQuote" ("coproprieteId", sujet) where "deletedAt" is null;

-- Contrôle après exécution (attendu : 6 lignes, deux par table) :
-- select table_name, column_name from information_schema.columns
--   where table_name in ('InsuranceOffer', 'GasOffer', 'CtqQuote')
--     and column_name in ('deletedAt', 'deletedById')
--   order by table_name, column_name;
