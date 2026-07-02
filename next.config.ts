import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Reprise-copro : l'analyse recoit les PDF (RCP scanne, EDD, PV...) via une Server
    // Action. Le defaut Next est 1 MB -> insuffisant pour des scans. On releve la limite.
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
