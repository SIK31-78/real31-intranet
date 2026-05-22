# `lib/domain/` - Types et règles métier purs

Cf. **ADR-001** (architecture hexagonale).

**Ce qui vit ici :**

- Types métier (`Copropriete`, `Evenement`, `Jalon`, `ItemODJ`, etc.)
- Règles métier pures (calculs de dates, validations, invariants)
- Constantes légales (`DELAIS_LEGAUX`, références d'articles)

**Règle absolue :** zéro dépendance technique. Aucun import de Next.js,
React, Supabase, fetch, Date externe. Du TypeScript pur testable hors
contexte.

L'ESLint config bloque les imports non conformes (cf. `eslint.config.mjs`).
