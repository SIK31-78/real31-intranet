import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Reprise compta : pdfjs-dist (lecture couche texte des grands livres) doit rester un
  // module Node externe - bundle par Next, son import dynamique echoue au runtime et la
  // voie couche texte retombe silencieusement sur l'OCR (ecart -25,57 reapparu + intitules
  // absents constates le 2026-07-09).
  serverExternalPackages: ["pdfjs-dist"],
  experimental: {
    // Reprise-copro : l'analyse recoit les PDF (RCP scanne, EDD, PV...) via une Server
    // Action. Le defaut Next est 1 MB -> insuffisant pour des scans. On releve la limite.
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
};

// Sentry (ADR-020). Les source maps ne partent chez Sentry que si SENTRY_AUTH_TOKEN /
// SENTRY_ORG / SENTRY_PROJECT sont poses (Vercel) ; sans eux, la build passe, les piles
// sont juste minifiees. `tunnelRoute` fait transiter les evenements navigateur par notre
// domaine (les bloqueurs de pub coupent *.sentry.io) - la route est exclue du proxy d'auth.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  disableLogger: true,
});
