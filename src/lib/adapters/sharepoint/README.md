# `lib/adapters/sharepoint/` — Adapter SharePoint (Microsoft Graph)

Cf. **ADR-001** (architecture hexagonale), **ADR-002** (sync miroir nocturne),
**ADR-003** (migration progressive).

**Ce qui vit ici :**

- Client Microsoft Graph (`@microsoft/microsoft-graph-client`)
- Implémentations concrètes des ports : `SharePointCoproAdapter`, etc.
- Mappers SharePoint → Domain (noms internes de colonnes → types métier)

**Règle d'isolation :** ce dossier est **le seul** autorisé à importer
`@microsoft/microsoft-graph-client`, `@microsoft/microsoft-graph-types`,
`@azure/identity`. Toute tentative ailleurs déclenche une erreur ESLint.

Cet adapter est appelé **uniquement par les jobs de sync** (cf. ADR-002).
Pas par les pages, pas par les services, pas par les Server Actions.
