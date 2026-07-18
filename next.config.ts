import type { NextConfig } from "next";

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

export default nextConfig;
