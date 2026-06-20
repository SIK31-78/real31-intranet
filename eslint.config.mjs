import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/**
 * TODO: migrer vers la nouvelle API `boundaries/dependencies` (eslint-plugin-boundaries v6).
 * Pour l'instant, on utilise l'API legacy `boundaries/element-types` et `boundaries/external`
 * qui fonctionne pleinement mais affiche des warnings de dépréciation à chaque lint.
 * La migration sera tracée dans un futur ADR - pas urgent, juste à faire avant la suppression
 * de l'API legacy (annoncée mais pas datée par le plugin).
 *
 * Architecture hexagonale (Ports & Adapters) - cf. DECISIONS.md / ADR-001.
 *
 * Chaque "élément" est un répertoire avec des règles strictes d'import :
 *
 *   - `domain`            : types métier purs, zéro dépendance technique
 *   - `ports`             : interfaces (contrats), dépendent uniquement du domaine
 *   - `adapter-*`         : implémentations concrètes. Un adapter ne peut JAMAIS
 *                           importer un autre adapter ni le router
 *   - `router`            : seul endroit qui peut importer tous les adapters
 *   - `services`          : logique applicative, passe par les ports + router
 *   - `jobs`              : tâches cron, peuvent toucher les adapters directement
 *                           (orchestration des syncs)
 *   - `audit`, `auth`     : helpers transverses
 *   - `app`               : routes Next.js, passe par les services
 *
 * Les SDKs externes (Microsoft Graph, Supabase, GraphQL) sont confinés à leur
 * adapter respectif. Toute fuite vers `services`, `app`, etc. déclenche une
 * erreur ESLint.
 *
 * Pour vérifier les règles : `pnpm lint`.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  {
    plugins: { boundaries },

    settings: {
      // Périmètre couvert par les règles boundaries
      "boundaries/include": ["src/**/*"],

      // Définition des éléments architecturaux
      "boundaries/elements": [
        { type: "domain",              pattern: "src/lib/domain/**" },
        { type: "ports",               pattern: "src/lib/ports/**" },
        { type: "adapter-sharepoint",  pattern: "src/lib/adapters/sharepoint/**" },
        { type: "adapter-estale",      pattern: "src/lib/adapters/estale/**" },
        { type: "adapter-supabase",    pattern: "src/lib/adapters/supabase/**" },
        { type: "adapter-mock",        pattern: "src/lib/adapters/mock/**" },
        { type: "adapter-fichier",     pattern: "src/lib/adapters/fichier/**" },
        { type: "router",              pattern: "src/lib/adapters/router*.ts" },
        { type: "services",            pattern: "src/lib/services/**" },
        { type: "jobs",                pattern: "src/lib/jobs/**" },
        { type: "audit",               pattern: "src/lib/audit/**" },
        { type: "auth",                pattern: "src/lib/auth/**" },
        { type: "app",                 pattern: "src/app/**" },
      ],
    },

    rules: {
      // Règle 1 - Qui peut importer qui (graphe de dépendances inter-modules)
      // Par défaut tout est interdit ; on liste explicitement ce qui est permis.
      "boundaries/element-types": ["error", {
        default: "disallow",
        rules: [
          // Domaine : isolé, ne dépend de rien d'autre que de lui-même
          { from: "domain",             allow: ["domain"] },

          // Ports : voient le domaine pour typer leurs signatures
          { from: "ports",              allow: ["domain", "ports"] },

          // Adapters : implémentent les ports, jamais ne s'importent entre eux
          { from: "adapter-sharepoint", allow: ["domain", "ports"] },
          { from: "adapter-estale",     allow: ["domain", "ports"] },
          { from: "adapter-supabase",   allow: ["domain", "ports"] },
          { from: "adapter-mock",       allow: ["domain", "ports"] },
          { from: "adapter-fichier",    allow: ["domain", "ports"] },

          // Router : seul endroit qui connaît tous les adapters
          { from: "router",             allow: ["domain", "ports", "adapter-sharepoint", "adapter-estale", "adapter-supabase", "adapter-mock", "adapter-fichier"] },

          // Audit, auth : helpers transverses qui parlent au domaine via ports
          { from: "audit",              allow: ["domain", "ports"] },
          { from: "auth",               allow: ["domain", "ports", "audit"] },

          // Services : orchestrent via ports + router, jamais directement un adapter
          { from: "services",           allow: ["domain", "ports", "router", "audit"] },

          // Jobs (cron) : peuvent appeler les adapters directement (orchestration de syncs)
          { from: "jobs",               allow: ["domain", "ports", "adapter-sharepoint", "adapter-estale", "adapter-supabase", "adapter-mock", "router", "audit"] },

          // App : routes Next.js, passent par services / audit / auth
          { from: "app",                allow: ["domain", "ports", "services", "audit", "auth"] },
        ],
      }],

      // Règle 2 - SDKs externes confinés à leur adapter respectif.
      // Évite que `@supabase/supabase-js` apparaisse dans un Server Component ou un service.
      "boundaries/external": ["error", {
        default: "allow",
        rules: [
          // Microsoft Graph (SharePoint, Mail) : uniquement dans adapter-sharepoint
          {
            from: ["domain", "ports", "services", "audit", "auth", "app", "jobs", "router", "adapter-estale", "adapter-supabase", "adapter-mock"],
            disallow: [
              "@microsoft/microsoft-graph-client",
              "@microsoft/microsoft-graph-types",
              "@azure/identity",
            ],
          },
          // Supabase : uniquement dans adapter-supabase
          {
            from: ["domain", "ports", "services", "audit", "auth", "app", "jobs", "router", "adapter-estale", "adapter-sharepoint", "adapter-mock"],
            disallow: [
              "@supabase/supabase-js",
              "@supabase/ssr",
            ],
          },
          // Clients GraphQL : uniquement dans adapter-estale
          {
            from: ["domain", "ports", "services", "audit", "auth", "app", "jobs", "router", "adapter-sharepoint", "adapter-supabase", "adapter-mock"],
            disallow: [
              "@apollo/client",
              "graphql-request",
              "graphql",
              "urql",
            ],
          },
        ],
      }],
    },
  },
]);

export default eslintConfig;
