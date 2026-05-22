# `lib/auth/` - Authentification et session

Cf. **ADR-009** (permissions/scopes), **ADR-010** (mapping initiales/email),
**ADR-011** (RLS).

**Ce qui vit ici :**

- Provider d'auth (mock-provider en J1a, Entra-id-provider en J1b)
- Helpers `getSession()`, `requireSession()`, `getCurrentUser()`
- Middleware Next.js qui pose le contexte utilisateur

**Conception "swap-friendly"** : le module expose une seule interface
abstraite. En J1a on branche un mock (page `/dev-login` choisissant un
gestionnaire fictif). En J1b on remplace le provider par Entra ID, sans
toucher au code applicatif qui appelle `getCurrentUser()`.

À mettre en place dans l'Increment 3 du plan J1a.
