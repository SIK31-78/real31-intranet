// DIAG temporaire (a supprimer) : noms presents sur PLUSIEURS comptes 450 du grand livre reel.
// Ne loggue AUCUN nom - uniquement des numeros de compte, prefixes et counts.
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

describe("diag doublons 450", () => {
  it("stats noms multi-comptes", async () => {
    const { extraireTextePages, estPdfNatif } = await import("@/lib/reprise/adapters/shared/pdf-texte");
    const pdf = new Uint8Array(readFileSync("C:/Users/SekouKOMA/projects/real31-intranet/data/GRAND_LIVRE_20251001-20260930.pdf"));
    const pages = await extraireTextePages(pdf);
    void estPdfNatif;
    const { parserGrandLivrePositions } = await import("@/lib/reprise/adapters/shared/parseur-grand-livre-positions");
    const { normaliserNom } = await import("@/lib/reprise/domain/mapping-compta");
    const r = parserGrandLivrePositions(pages);
    const intitules = r.intitules ?? {};
    const comptes45 = Object.keys(intitules).filter((c) => /^45/.test(c));

    // Prefixe = les 4 premiers chiffres (4501, 4502...).
    const parPrefixe = new Map<string, number>();
    for (const c of comptes45) {
      const p = c.replace(/\D/g, "").slice(0, 4);
      parPrefixe.set(p, (parPrefixe.get(p) ?? 0) + 1);
    }
    console.log("comptes 45x avec en-tete :", comptes45.length);
    console.log("repartition par prefixe :", JSON.stringify(Object.fromEntries(parPrefixe)));

    // Noms normalises presents sur 2+ comptes.
    const parNom = new Map<string, string[]>();
    for (const c of comptes45) {
      const n = normaliserNom(intitules[c] ?? "");
      if (!n) continue;
      parNom.set(n, [...(parNom.get(n) ?? []), c]);
    }
    const multi = [...parNom.entries()].filter(([, cs]) => cs.length > 1);
    console.log(`noms distincts : ${parNom.size} | noms sur 2+ comptes : ${multi.length}`);
    for (const [, cs] of multi) {
      const prefixes = cs.map((c) => c.replace(/\D/g, "").slice(0, 4));
      const memesPrefixes = new Set(prefixes).size === 1;
      console.log(`  comptes: ${cs.join(" + ")} | prefixes ${memesPrefixes ? "IDENTIQUES" : "differents"}`);
    }
  }, 120000);
});
