# `lib/adapters/supabase/` — Adapter Supabase (BDD natif)

Cf. **ADR-001**, **ADR-002** (UI lit toujours Supabase),
**ADR-011** (RLS activée).

**Ce qui vit ici :**

- Client Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
- Implémentations natives : `SupabaseCoproAdapter`, `SupabaseJalonAdapter`, …
- Types codegen depuis le schéma (`pnpm supabase gen types`)
- Helpers de client (auth-context-aware vs service role)

**Règle d'isolation :** seul endroit autorisé à importer `@supabase/*`.

Contrairement aux adapters SharePoint et eStale, **celui-ci EST appelé
par les Server Components, Server Actions et services** — c'est le chemin
de lecture principal de toute l'UI (cf. ADR-002).
