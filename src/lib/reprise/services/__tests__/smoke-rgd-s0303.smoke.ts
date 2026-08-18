// SMOKE manuel : parseur RGD sur le document REEL de S0303 (bloc B). LECTURE SEULE.
// Filet (chiffres Sekou, balance au 06/05/2026) : Total general = 7 886,79 EUR = classe 6
// de la balance AU CENTIME. Rapport d'AGREGATS seulement (jamais un nom) dans le scratchpad.
//   npx vitest run --config vitest.smoke.config.mts src/lib/reprise/services/__tests__/smoke-rgd-s0303.smoke.ts
// NB : le PDF est copie dans le scratchpad sous un nom sans accents (le nom du fichier
// source melange les normalisations Unicode et casse readFileSync).
import { readFileSync, writeFileSync, copyFileSync, globSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOSSIER_REPRISE =
  "C:/Users/SekouKOMA/REAL 31/Syndic - ML/S303 - St Germain 37bis/Comptabilité/Reprise";
const SCRATCH =
  "C:/Users/SEKOUK~1/AppData/Local/Temp/claude/C--Users-SekouKOMA-projects-real31-intranet/da5ad1a1-f739-46fd-ac4d-642eb7d3bbe9/scratchpad";

/** Total general attendu = classe 6 de la balance au 06/05/2026 (mesure Sekou). */
const TOTAL_GENERAL_ATTENDU = 7886.79;

describe("smoke RGD S0303 (reel, lecture seule)", () => {
  it("parse le RGD 2026 et confronte au filet balance", async () => {
    const { extraireTextePages } = await import("@/lib/reprise/adapters/shared/pdf-texte");
    const { parserRgd } = await import("@/lib/reprise/adapters/shared/parseur-rgd");
    const { verifierTotauxRgd } = await import("@/lib/reprise/domain/rgd");

    // Copie sous un nom sur (accents du nom source instables selon la normalisation).
    const source = globSync(`${DOSSIER_REPRISE}/Relev*2026.pdf`)[0]!;
    const local = `${SCRATCH}/rgd-2026.pdf`;
    copyFileSync(source, local);

    const pages = await extraireTextePages(new Uint8Array(readFileSync(local)));
    const r = parserRgd(pages);
    const verdict = verifierTotauxRgd(r.depenses, r.totaux);

    const general = r.totaux.find((x) => x.portee === "general");
    const sommeDepenses = r.depenses.reduce((s, d) => s + d.montant, 0);
    const parCle = new Map<string, number>();
    for (const d of r.depenses) parCle.set(d.cle, (parCle.get(d.cle) ?? 0) + d.montant);

    const out: string[] = [];
    out.push(`pages ${pages.length} | depenses ${r.depenses.length} | totaux imprimes ${r.totaux.length}`);
    for (const n of r.notes) out.push(`note : ${n}`);
    out.push(`somme des depenses : ${sommeDepenses.toFixed(2)}`);
    out.push(`total general imprime : ${general?.montant.toFixed(2) ?? "ABSENT"} (attendu ${TOTAL_GENERAL_ATTENDU.toFixed(2)})`);
    out.push(`reconciliation : ${verdict.controles} controle(s), ${verdict.enEcart.length} en ecart`);
    for (const e of verdict.enEcart.slice(0, 10))
      out.push(`  ecart ${e.portee} ${e.champ} : attendu ${e.attendu} obtenu ${e.obtenu}`);
    out.push("totaux par cle (agregats, cles = libelles imprimes du document) :");
    for (const [cle, m] of parCle) out.push(`  ${cle} : ${m.toFixed(2)}`);
    writeFileSync(`${SCRATCH}/smoke-rgd.txt`, out.join("\n"), "utf8");

    // Le filet est une ASSERTION, pas un affichage : le smoke echoue si le compte n'y est pas.
    expect(general?.montant).toBeCloseTo(TOTAL_GENERAL_ATTENDU, 2);
    expect(sommeDepenses).toBeCloseTo(TOTAL_GENERAL_ATTENDU, 2);
    expect(verdict.enEcart).toHaveLength(0);
  }, 120_000);
});
