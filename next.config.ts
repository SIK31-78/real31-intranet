import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { entetesSecurite } from "./src/lib/securite/entetes-http";
import { versionDuBuild } from "./src/lib/domain/version-app";

const FICHIERS_CHROMIUM = [
  "./node_modules/playwright-core/**",
  "./node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/**",
  "./node_modules/@sparticuz/chromium/**",
  "./node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/**",
  // Aptos, lue par chemin pour etre embarquee dans l'HTML du PDF.
  "./src/lib/services/pdf/polices/**",
];

const nextConfig: NextConfig = {
  // Version figée dans le code client au build (REA-312) : le bandeau « nouvelle version »
  // la compare à celle que renvoie /api/version.
  env: {
    NEXT_PUBLIC_VERSION_APP: versionDuBuild(process.env),
  },
  // Reprise compta : pdfjs-dist (lecture couche texte des grands livres) doit rester un
  // module Node externe - bundle par Next, son import dynamique echoue au runtime et la
  // voie couche texte retombe silencieusement sur l'OCR (ecart -25,57 reapparu + intitules
  // absents constates le 2026-07-09).
  //
  // PDF du contrat (ADR-012 v3) : playwright-core et @sparticuz/chromium restent externes
  // eux aussi (binaire Chromium lu par chemin), et les archives .br de Chromium sont
  // embarquees avec les fonctions qui rendent un PDF (routes contrat.pdf, envoi de l'offre).
  serverExternalPackages: ["pdfjs-dist", "playwright-core", "@sparticuz/chromium"],
  // Vercel installe avec pnpm : les paquets vivent sous node_modules/.pnpm/<nom>@<version>/,
  // et le traceur ne suit pas les fichiers lus par chemin calcule (browsers.json de
  // playwright-core manquait en prod le 17/09). On cible les deux formes de chemin.
  outputFileTracingIncludes: {
    "/contrat/**": FICHIERS_CHROMIUM,
    "/propositions/**": FICHIERS_CHROMIUM,
    // PAS de glob pdfjs-dist ici (retiré le 21/10/2026). L'ajout du 20/10, censé embarquer le
    // worker de pdfjs avec le tri des mails, laissait le build passer mais Vercel refusait
    // ensuite le paquet : « invalid deployment package for a Serverless Function... files in
    // symlinked directories » (node_modules/pdfjs-dist est un lien symbolique sous pnpm).
    // Cinq déploiements ratés, prod figée 20 h. Le worker pdfjs reste à embarquer autrement.
    // ODJ du CS : le gabarit du cabinet est lu par chemin (adapters/docx), le logo aussi
    // (en-tete du Word rempli et de son PDF), et le PDF passe par Chromium comme le contrat.
    "/odj/**": [
      "./src/lib/adapters/docx/gabarits/**",
      "./public/logo-real31.png",
      ...FICHIERS_CHROMIUM,
    ],
  },
  experimental: {
    // 4 Mo : Vercel coupe toute requete vers une fonction a 4,5 Mo, quoi que dise Next. Les
    // 30 Mo d'avant (reprise-copro, qui passe depuis par la route /api/reprise/analyser) ne
    // jouaient qu'en local et masquaient le probleme. Les gros fichiers passent par des routes
    // en tranches (pieces jointes d'une reponse : /mes-emails/pj/depot, REA-421, 27/10/2026).
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  // En-tetes de securite (audit 16/09/2026) : anti-iframe, nosniff, referrer, HSTS, et une
  // CSP en REPORT-ONLY (rapports vers Sentry) avant de la rendre bloquante.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: entetesSecurite({
          dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
          dev: process.env.NODE_ENV !== "production",
        }),
      },
    ];
  },
};

// Sentry (ADR-020). Les source maps ne partent chez Sentry que si SENTRY_AUTH_TOKEN /
// SENTRY_ORG / SENTRY_PROJECT sont poses (Vercel) ; sans eux, la build passe, les piles
// sont juste minifiees. Le tunnel navigateur est MAISON (src/app/monitoring/route.ts,
// `tunnel` dans instrumentation-client) : celui du SDK relayait vers n'importe quel projet.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});
