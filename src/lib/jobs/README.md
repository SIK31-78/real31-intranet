# `lib/jobs/` - Tâches programmées (sync, alertes, automatisations)

Cf. **ADR-004**.

**Ce qui vit ici :**

- Jobs de sync (SharePoint nocturne, eStale read-through cache)
- Jobs d'alertes (à partir d'Increment J5 - Inngest)
- Synthèses programmées

**Règle :** chaque job est une **fonction TypeScript pure**, appelable :

1. Via Vercel Cron (handler dans `src/app/api/cron/`)
2. Via Inngest (à partir de J5)
3. **Via CLI** (`pnpm tsx scripts/sync-sharepoint.ts`) - critique pour
   le dev local et le debug en prod

Les jobs ont l'autorisation d'importer les adapters directement (ils
orchestrent les syncs par source).
