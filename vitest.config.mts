import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resout l'alias "@/..." (= src/...) pour les tests, comme tsconfig le fait pour
// le typecheck. Sans ca, tout test important un module qui utilise "@/" echoue.
//
// Les tests SMOKE (vrais appels eStale / fichiers locaux / credentials) sont nommes
// `*.smoke.ts` : HORS du include par defaut (`*.test.*`), donc `vitest run` reste 100 %
// offline. Ils se lancent a la main via `pnpm run test:smoke` (cf. vitest.smoke.config.mts).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
