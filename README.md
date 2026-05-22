# REAL31 Intranet

Surcouche de coordination par-dessus eStale (et Crypto pendant la transition de 6 mois) pour le cabinet de syndic **REAL31** à Toulouse. Voir [`DECISIONS.md`](./DECISIONS.md) — **ADR-008** pour le périmètre exact.

> **Si tu arrives sur ce projet, lis dans cet ordre :**
> 1. [`DECISIONS.md`](./DECISIONS.md) — les 13 ADRs qui posent l'architecture
> 2. [`ROADMAP.md`](./ROADMAP.md) — l'état d'avancement et les jalons à venir
> 3. [`real31-mockup.html`](./real31-mockup.html) — la référence UX (5 écrans)
> 4. Les `README.md` à l'intérieur de `src/lib/*/` — rappel du rôle de chaque dossier

## Stack

- **Next.js 16** (App Router) + **TypeScript strict**
- **Tailwind 4** + shadcn/ui (à venir)
- **Supabase** (région EU) pour la BDD, l'auth contextuelle (RLS) et le storage
- **Microsoft Entra ID** pour le SSO M365 (à brancher en J1b, dépendance DSI)
- **Microsoft Graph API** pour les emails sortants et la lecture SharePoint
- **Vercel** pour l'hébergement (serverless, stateless)
- **pnpm** comme gestionnaire de paquets
- **Node 22** (pinné via `.node-version`, fnm bascule automatiquement)

## Démarrage rapide

```bash
# 1. (une fois) installer Node via fnm
fnm install
fnm use

# 2. installer les dépendances
pnpm install

# 3. lancer le serveur de dev
pnpm dev
```

Ouvrir <http://localhost:3000>.

## Commandes utiles

| Commande | Description |
|---|---|
| `pnpm dev` | Dev server (Turbopack, hot reload) |
| `pnpm build` | Build de production |
| `pnpm start` | Lancer un build de production |
| `pnpm lint` | ESLint (inclut les règles d'architecture, cf. ADR-001) |
| `pnpm typecheck` | TypeScript en mode `--noEmit` |
| `pnpm check` | `typecheck` + `lint` + `build` (avant de pousser) |

## Architecture en bref

Hexagonale (Ports & Adapters). Trois couches strictes :

```
src/
├── app/                    # Routes Next.js (Server / Client Components)
└── lib/
    ├── domain/             # Types métier purs, zéro dépendance technique
    ├── ports/              # Interfaces (CoproRepository, EvenementRepository, …)
    ├── adapters/
    │   ├── sharepoint/     # Microsoft Graph — uniquement appelé par les jobs
    │   ├── estale/         # GraphQL — appelé par les jobs (cache TTL court)
    │   ├── supabase/       # supabase-js — chemin de lecture de toute l'UI
    │   ├── mock/           # données fictives (dev + tests)
    │   └── router.ts       # sélection de l'adapter selon copros.source
    ├── services/           # Cas d'usage métier, orchestration
    ├── jobs/               # Sync, alertes, automatisations (cron)
    ├── audit/              # audit_log RGPD + activity_log produit
    └── auth/               # Session, mock-provider (J1a) → Entra ID (J1b)
```

**Règle d'isolation** : aucun import direct des SDKs externes (`@microsoft/microsoft-graph-client`, `@supabase/supabase-js`, `graphql-request`, etc.) en dehors de leur adapter respectif. C'est appliqué par `eslint-plugin-boundaries` — cf. [`eslint.config.mjs`](./eslint.config.mjs).

Pour tester la règle :

```bash
# crée un fichier qui viole la règle, lance le lint, observe l'erreur :
echo "import { createClient } from '@supabase/supabase-js'; export const c = createClient('', '');" > src/lib/services/test-violation.ts
pnpm lint   # → erreur boundaries/external
rm src/lib/services/test-violation.ts
```

## Variables d'environnement

À documenter dans `.env.example` au fur et à mesure que les briques sont câblées (Increment 2+). Pour J1a, aucune n'est encore nécessaire.

## Statut MVP

- ✅ J1a — Fondations techniques (mock auth, scaffolding)
- ⏸️ J1b — Branchement Entra ID (dépend du DSI, cf. `docs/entra-app-registration.md`)
- 🔲 J2 — Écrans + MockProvider
- 🔲 J3 — Branchement SharePoint
- 🔲 J4 — Branchement eStale
- 🔲 J5 — Alertes + mails
- 🔲 J6 — Pré-prod + go-live

Détail dans [`ROADMAP.md`](./ROADMAP.md).
