// SMOKE manuel : LE VERDICT S0303 avec la preuve de bascule (regle Sekou 2026-08-18).
// LECTURE SEULE. Trois documents reels : GL 2026 + balance au 06/05/2026 + RGD 2026.
// Attendu : le blocage avant-repartition se DEGRADE de lui-meme en avertissement (sans
// levee manuelle), parce que l'extraction reproduit la balance au centime ET que la classe 6
// de la balance est recoupee par le RGD. Rapport d'agregats dans le scratchpad.
//   npx vitest run --config vitest.smoke.config.mts src/lib/reprise/services/__tests__/smoke-preuve-bascule-s0303.smoke.ts
import { readFileSync, writeFileSync, copyFileSync, globSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  const txt = readFileSync("C:/Users/SekouKOMA/projects/real31-intranet/.env.local", "utf8");
  for (const l of txt.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i);
    if (!process.env[k]) process.env[k] = t.slice(i + 1);
  }
});

const REPRISE = "C:/Users/SekouKOMA/REAL 31/Syndic - ML/S303 - St Germain 37bis/Comptabilité/Reprise";
const ARCHIVES = "C:/Users/SekouKOMA/REAL 31/Syndic - ML/S303 - St Germain 37bis/Archives";
const SCRATCH =
  "C:/Users/SEKOUK~1/AppData/Local/Temp/claude/C--Users-SekouKOMA-projects-real31-intranet/da5ad1a1-f739-46fd-ac4d-642eb7d3bbe9/scratchpad";

describe("smoke S0303 - preuve de bascule (reel, lecture seule)", () => {
  it(
    "le blocage avant-repartition se degrade en avertissement, arithmetiquement",
    async () => {
      const { extraireTextePages } = await import("@/lib/reprise/adapters/shared/pdf-texte");
      const { CoucheTexteComptaExtractionProvider } = await import(
        "@/lib/reprise/adapters/compta-extraction/couche-texte-provider"
      );
      const { parserBalance } = await import("@/lib/reprise/adapters/shared/parseur-balance");
      const { parserRgd } = await import("@/lib/reprise/adapters/shared/parseur-rgd");
      const { preparerRevueMapping } = await import("../mapping-compta");
      const { ReelEstaleComptaLectureProvider } = await import(
        "@/lib/reprise/adapters/estale-compta/reel-provider"
      );

      // Copies sous noms surs (accents instables dans les noms sources).
      copyFileSync(globSync(`${ARCHIVES}/Balance*06 mai 2026.pdf`)[0]!, `${SCRATCH}/balance-0605.pdf`);
      copyFileSync(globSync(`${REPRISE}/Relev*2026.pdf`)[0]!, `${SCRATCH}/rgd-2026.pdf`);

      const jeu = await new CoucheTexteComptaExtractionProvider().extraireGrandLivre([
        { nom: "gl.pdf", contenu: new Uint8Array(readFileSync(`${REPRISE}/Grand livre - Exercice 2026.pdf`)) },
      ]);
      const balance = parserBalance(await extraireTextePages(new Uint8Array(readFileSync(`${SCRATCH}/balance-0605.pdf`))));
      const rgd = parserRgd(await extraireTextePages(new Uint8Array(readFileSync(`${SCRATCH}/rgd-2026.pdf`))));
      const totalRgd = rgd.totaux.find((t) => t.portee === "general")?.montant;

      const r = await preparerRevueMapping(
        jeu,
        "S0303",
        new ReelEstaleComptaLectureProvider(),
        undefined,
        undefined,
        {
          soldes: balance.soldes,
          ...(balance.dateBascule ? { dateBascule: balance.dateBascule } : {}),
          ...(totalRgd !== undefined ? { totalGeneralRgd: totalRgd } : {}),
        },
      );

      const out: string[] = [];
      for (const n of balance.notes) out.push(`balance : ${n}`);
      out.push(`total general RGD : ${totalRgd?.toFixed(2) ?? "ABSENT"}`);
      if (!r.ok) {
        out.push(`PLAN KO : ${r.message}`);
      } else {
        out.push("");
        out.push(`erreurs (${r.plan.erreurs.length}) :`);
        for (const e of r.plan.erreurs) out.push(`  - ${e}`);
        out.push(`warnings (${r.plan.warnings.length}) :`);
        for (const w of r.plan.warnings) out.push(`  - ${w}`);
        out.push(`notes (${r.plan.notes.length}) :`);
        for (const n of r.plan.notes) out.push(`  - ${n}`);
        out.push(`pretAImporter = ${r.plan.pretAImporter}`);
      }
      writeFileSync(`${SCRATCH}/smoke-preuve.txt`, out.join("\n"), "utf8");

      // LE verdict : plus AUCUNE erreur avant-repartition, la degradation est un warning
      // qui nomme son appui, et le verdict porte la preuve (rejouable cote client).
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.plan.erreurs.some((e) => /AVANT repartition/i.test(e))).toBe(false);
      const w = r.plan.warnings.find((x) => /DEGRADE en avertissement/i.test(x));
      expect(w).toBeDefined();
      expect(w).toMatch(/reproduite au centime/);
      expect(w).toMatch(/classe 6 recoupee par le total du RGD/i);
      expect(r.plan.avantRepartition?.degradeParPreuve?.reproduite).toBe(true);
    },
    600_000,
  );
});
