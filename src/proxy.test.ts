import { describe, expect, it } from "vitest";
import { config } from "./proxy";

// Le matcher du gate d'acces : ce qui est exclu l'est PAR SEGMENT, pas par prefixe
// (audit du 16/09/2026 : « /fiches-internes » ou « /api/v1bis » seraient sortis du gate
// en silence). Next compile « /((?!…).*) » en une regex ancree ; on fait pareil ici.

const motif = config.matcher[0]!;
const RE = new RegExp(`^/${motif.slice("/(".length, -")".length)}$`);

describe("matcher du proxy", () => {
  it("laisse passer les surfaces qui portent leur propre securite", () => {
    for (const p of ["/fiche/abc123", "/fiche", "/api/fiche/x", "/api/v1/copros", "/api/v1", "/monitoring", "/monitoring/x", "/_next/static/a.js", "/_next/image", "/favicon.ico"]) {
      expect(RE.test(p), p).toBe(false);
    }
  });
  it("garde tout le reste, y compris les voisins de nom", () => {
    for (const p of ["/", "/accueil", "/fiches-internes", "/api/v1bis/x", "/monitoring-admin", "/api/fichesx", "/favicon.icon"]) {
      expect(RE.test(p), p).toBe(true);
    }
  });
});
