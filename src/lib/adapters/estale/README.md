# `lib/adapters/estale/` - Adapter eStale (GraphQL)

Cf. **ADR-001**, **ADR-002** (read-through cache TTL court),
**ADR-003** (migration), **ADR-005** (auth session cookie -> API key).

**Ce qui vit ici :**

- Client GraphQL (auth session cookie pour l'instant, API key à venir)
- Sous-module `auth/` avec implémentations swappables (`session-cookie-client.ts`,
  `api-key-client.ts`)
- Codegen GraphQL basé sur `docs/estale-schema.json`
- Mappers eStale -> Domain

**Règle d'isolation :** seul endroit autorisé à importer `@apollo/client`,
`graphql-request`, `graphql`, `urql`.

Appelé uniquement par les jobs (read-through cache) - cf. ADR-002.
