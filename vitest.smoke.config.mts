import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Config DEDIEE aux tests SMOKE (audit API 2026-07-16, P2-4) : les fichiers *.smoke.ts font
// de VRAIS appels (eStale, fichiers locaux, credentials .env.local) et ne doivent JAMAIS
// tourner dans `vitest run` standard (CI hermetique, 100 % offline). Ils sont nommes
// `*.smoke.ts` (hors du include par defaut `*.test.*`) et se lancent A LA MAIN via :
//   corepack pnpm run test:smoke            (tous les smokes)
//   corepack pnpm run test:smoke smoke-mapping   (un seul)
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.smoke.ts"],
    // Les smokes lisent des credentials et parlent au reseau : jamais en parallele.
    fileParallelism: false,
  },
});
