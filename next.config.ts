import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { entetesSecurite } from "./src/lib/securite/entetes-http";

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
