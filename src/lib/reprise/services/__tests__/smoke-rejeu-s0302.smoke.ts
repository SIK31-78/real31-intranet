// SMOKE : rejeu S0302 avec le plan corrige (comptes a report seul desormais au plan).
// Question de Sekou 2026-08-18 : le trou 502003 a-t-il deja mordu sur S0302 ?
// LECTURE SEULE. Rapport d'agregats dans le scratchpad.
import { readFileSync, writeFileSync } from "node:fs";
import { beforeAll, describe, it } from "vitest";

beforeAll(() => {
  const txt = readFileSync("C:/Users/SekouKOMA/projects/real31-intranet/.env.local", "utf8");
  for (const l of txt.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    if (!process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1);
  }
});

const GL = "C:/Users/SekouKOMA/projects/real31-intranet/data/GRAND_LIVRE_20251001-20260930.pdf";
const SORTIE =
  "C:/Users/SEKOUK~1/AppData/Local/Temp/claude/C--Users-SekouKOMA-projects-real31-intranet/da5ad1a1-f739-46fd-ac4d-642eb7d3bbe9/scratchpad/rejeu-s0302.txt";

describe("smoke rejeu S0302 (reel, lecture seule)", () => {
  it("les comptes a report seul entrent-ils au plan, et combien manquaient ?", async () => {
    const { CoucheTexteComptaExtractionProvider } = await import(
      "@/lib/reprise/adapters/compta-extraction/couche-texte-provider"
    );
    const { construirePlanMapping } = await import("../mapping-compta");
    const { ReelEstaleComptaLectureProvider } = await import(
      "@/lib/reprise/adapters/estale-compta/reel-provider"
    );
    const jeu = await new CoucheTexteComptaExtractionProvider().extraireGrandLivre([
      { nom: "gl.pdf", contenu: new Uint8Array(readFileSync(GL)) },
    ]);
    const out: string[] = [];
    const aMouvement = new Set(jeu.lignes.map((l) => l.compte));
    const reportSeul = (jeu.controles ?? []).filter(
      (c) => !aMouvement.has(c.compte) && Math.abs(c.reportDebit ?? 0) + Math.abs(c.reportCredit ?? 0) >= 0.005,
    );
    out.push(`ecritures ${jeu.lignes.length} | comptes a mouvement ${aMouvement.size} | controles ${jeu.controles?.length ?? 0}`);
    out.push(`comptes a REPORT SEUL (invisibles de l'ancien plan) : ${reportSeul.length}`);
    for (const c of reportSeul)
      out.push(`  ${c.compte}  report D ${(c.reportDebit ?? 0).toFixed(2)}  C ${(c.reportCredit ?? 0).toFixed(2)}`);

    const r = await construirePlanMapping(jeu, "S0302", new ReelEstaleComptaLectureProvider());
    if (!r.ok) out.push(`plan KO : ${r.message}`);
    else {
      out.push("");
      out.push("statut de ces comptes dans le plan CORRIGE :");
      for (const c of reportSeul) {
        const e = r.plan.entrees.find((x) => x.compteSource === c.compte);
        out.push(`  ${c.compte} -> ${e ? `${e.statut} [${e.categorie}]` : "ABSENT (?)"}`);
      }
    }
    writeFileSync(SORTIE, out.join("\n"), "utf8");
  }, 300_000);
});
