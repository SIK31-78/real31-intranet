# `lib/services/` — Logique applicative (orchestration)

Cf. **ADR-001**.

**Ce qui vit ici :**

- Cas d'usage métier (`marquerJalonAccompli`, `bascullerSourceCopro`, …)
- Orchestration de plusieurs ports/repositories
- Appels à `withAudit()` pour la traçabilité

**Règle :** passe par les **ports** (interfaces), jamais directement par
un adapter spécifique. Le routeur (`lib/adapters/router.ts`) sélectionne
le bon adapter selon `copros.source`.

Les Server Components et Server Actions appellent les services, pas
directement les adapters.
