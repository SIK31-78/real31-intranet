import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resout l'alias "@/..." (= src/...) pour les tests, comme tsconfig le fait pour
// le typecheck. Sans ca, tout test important un module qui utilise "@/" echoue.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
