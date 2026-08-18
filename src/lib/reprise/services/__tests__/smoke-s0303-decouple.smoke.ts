// SMOKE manuel : reprise compta DECOUPLEE sur S0303 (copro DEJA creee dans eStale, jamais
// passee par le pipeline patrimoine de l'intranet). LECTURE SEULE - aucune ecriture.
//
// C'est LE test d'acceptation de la coupe (a) du 2026-08-18 : "code copro + PDF" doivent
// suffire. Extraction couche texte (chemin de production, meme provider que le routeur),
// puis plan de mapping avec liaison AUTO contre les owners eStale (refs 0001..000A).
//
// Ne loggue QUE des agregats et des references (compteurs, ecarts, refs owners) - JAMAIS
// de nom ni d'intitule (PII). Lancement :
//   npx vitest run --config vitest.smoke.config.mts src/lib/reprise/services/__tests__/smoke-s0303-decouple.smoke.ts
import { readFileSync, writeFileSync } from "node:fs";
import { describe, it, beforeAll } from "vitest";

beforeAll(() => {
  const txt = readFileSync("C:/Users/SekouKOMA/projects/real31-intranet/.env.local", "utf8");
  for (const l of txt.split("\n")) {
    const s = l.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const i = s.indexOf("=");
    const k = s.slice(0, i);
    if (!process.env[k]) process.env[k] = s.slice(i + 1);
  }
});

const GL_2026 =
  "C:/Users/SekouKOMA/REAL 31/Syndic - ML/S303 - St Germain 37bis/Comptabilité/Reprise/Grand livre - Exercice 2026.pdf";
const SORTIE =
  "C:/Users/SEKOUK~1/AppData/Local/Temp/claude/C--Users-SekouKOMA-projects-real31-intranet/da5ad1a1-f739-46fd-ac4d-642eb7d3bbe9/scratchpad/smoke-s0303.txt";

describe("smoke S0303 - reprise compta decouplee (reel, lecture seule)", () => {
  it(
    "extrait le GL 2026 (couche texte) puis construit le plan avec liaison auto owners eStale",
    async () => {
      const { CoucheTexteComptaExtractionProvider } = await import(
        "@/lib/reprise/adapters/compta-extraction/couche-texte-provider"
      );
      const { ReelEstaleComptaLectureProvider } = await import(
        "@/lib/reprise/adapters/estale-compta/reel-provider"
      );
      const { construirePlanMapping } = await import("../mapping-compta");

      const doc = { nom: "grand-livre-2026.pdf", contenu: new Uint8Array(readFileSync(GL_2026)) };
      const sortie: string[] = [];
      const log = (m: string) => sortie.push(m);

      const debut = Date.now();
      const jeu = await new CoucheTexteComptaExtractionProvider().extraireGrandLivre([doc]);
      const distincts = new Set(jeu.lignes.map((l) => l.compte));
      log("=== extraction (couche texte, chemin de production) ===");
      log(
        `duree ${Date.now() - debut} ms | ecritures ${jeu.lignes.length} | comptes distincts ${distincts.size} | intitules ${Object.keys(jeu.intitules ?? {}).length} | controles ${jeu.controles?.length ?? 0}`,
      );
      for (const n of jeu.notes) log(`  note extraction : ${n}`);

      const totalDebit = jeu.lignes.reduce((s, l) => s + (l.sens === "debit" ? l.montant : 0), 0);
      const totalCredit = jeu.lignes.reduce((s, l) => s + (l.sens === "credit" ? l.montant : 0), 0);
      log(
        `equilibre global : debit ${totalDebit.toFixed(2)} / credit ${totalCredit.toFixed(2)} / ecart ${(totalDebit - totalCredit).toFixed(2)}`,
      );
      const enEcart = (jeu.controles ?? []).filter((c) => {
        const attenduD = c.totalDebit ?? 0;
        const attenduC = c.totalCredit ?? 0;
        const ecritD = jeu.lignes.filter((l) => l.compte === c.compte && l.sens === "debit").reduce((s, l) => s + l.montant, 0) + (c.reportDebit ?? 0);
        const ecritC = jeu.lignes.filter((l) => l.compte === c.compte && l.sens === "credit").reduce((s, l) => s + l.montant, 0) + (c.reportCredit ?? 0);
        return Math.abs(ecritD - attenduD) > 0.005 || Math.abs(ecritC - attenduC) > 0.005;
      });
      log(`controles par compte : ${jeu.controles?.length ?? 0}, en ecart : ${enEcart.length}`);
      for (const c of enEcart.slice(0, 8)) log(`  ecart sur compte ${c.compte}`);

      log("");
      log("=== plan de mapping S0303 (liaison auto owners eStale) ===");
      const r = await construirePlanMapping(jeu, "S0303", new ReelEstaleComptaLectureProvider());
      if (!r.ok) {
        log(`KO : ${r.message}`);
      } else {
        const c = r.plan.compteurs;
        log(
          `statuts : mappe=${c.mappe} action_requise=${c.action_requise} warning=${c.warning_appariement} bloc_b=${c.reporte_bloc_b} bloc_c=${c.reporte_bloc_c} non_mappe=${c.non_mappe}`,
        );
        log(`pretAImporter = ${r.plan.pretAImporter}`);
        log(`erreurs (${r.plan.erreurs.length}) :`);
        for (const e of r.plan.erreurs) log(`  - ${e}`);
        log(`warnings (${r.plan.warnings.length}) :`);
        for (const w of r.plan.warnings) log(`  - ${w}`);
        log(`notes (${r.plan.notes.length}) :`);
        for (const n of r.plan.notes) log(`  - ${n}`);
      }
      writeFileSync(SORTIE, sortie.join("\n"), "utf8");
    },
    600_000,
  );
});
