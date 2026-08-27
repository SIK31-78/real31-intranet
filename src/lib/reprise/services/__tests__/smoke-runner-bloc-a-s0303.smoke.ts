// RUNNER de l'import BLOC A de S0303 (Inc. 3) - protocole Sekou 2026-08-18 :
//   1. plan + decisions PERSISTEES (les 4 clics de la revue) -> pretAImporter doit etre vert ;
//   2. DRY-REPLAY compare aux CINQ CIBLES par compte de la balance de bascule - rien ne part
//      tant que le dry ne les atteint pas toutes ;
//   3. emission REELLE (uniquement RUNNER_S0303=reel ET decisions persistees, jamais simulees) ;
//   4. RELECTURE eStale des cinq cibles -> une seule manque = annulerImport AUTOMATIQUE.
//
// PAS d'equilibre global : le lot bloc A seul est DESEQUILIBRE par construction (les reports
// 6/7 partent avec les blocs B et C). Le critere de succes est compte par compte.
//
// RUNNER_SIMULER=1 : injecte les 4 decisions EN MEMOIRE (etiquete SIMULATION) pour prouver la
// mecanique dry avant les clics reels. La voie reelle REFUSE la simulation.
//   npx vitest run --config vitest.smoke.config.mts src/lib/reprise/services/__tests__/smoke-runner-bloc-a-s0303.smoke.ts
import { readFileSync, writeFileSync, copyFileSync, globSync } from "node:fs";
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

const DOSSIER = "C:/Users/SekouKOMA/REAL 31/Syndic - ML/S303 - St Germain 37bis";
const GL = `${DOSSIER}/Comptabilité/Reprise/Grand livre - Exercice 2026.pdf`;
const SCRATCH =
  "C:/Users/SEKOUK~1/AppData/Local/Temp/claude/C--Users-SekouKOMA-projects-real31-intranet/da5ad1a1-f739-46fd-ac4d-642eb7d3bbe9/scratchpad";
const SORTIE =
  "C:/Users/SEKOUK~1/AppData/Local/Temp/claude/C--Users-SekouKOMA-projects-real31-intranet/da5ad1a1-f739-46fd-ac4d-642eb7d3bbe9/scratchpad/runner-bloc-a.txt";

/** Les CINQ cibles par compte (balance de bascule 06/05/2026, chiffres Sekou). Solde signe D+. */
const CIBLES: { prefixe: string; solde: number }[] = [
  { prefixe: "45", solde: 10671.63 },
  { prefixe: "40", solde: -5405.34 },
  { prefixe: "4719998", solde: 1133.1 },
  { prefixe: "4719999", solde: 6159.24 },
  { prefixe: "473", solde: -0.09 },
];
const DATE_OUVERTURE = "2026-01-01";
const TOL = 0.005;

describe("runner import bloc A S0303", () => {
  it(
    "dry-replay contre les cinq cibles, puis reel si RUNNER_S0303=reel",
    async () => {
      const { CoucheTexteComptaExtractionProvider } = await import(
        "@/lib/reprise/adapters/compta-extraction/couche-texte-provider"
      );
      const { preparerRevueMapping } = await import("../mapping-compta");
      const { appliquerDecisions } = await import("@/lib/reprise/domain/decisions-mapping");
      const { importerBlocA, annulerImport } = await import("../importer-bloc-a");
      const { DryRunEstaleComptaEcritureProvider } = await import(
        "@/lib/reprise/adapters/estale-compta/dry-run-ecriture-provider"
      );
      const { ReelEstaleComptaLectureProvider } = await import(
        "@/lib/reprise/adapters/estale-compta/reel-provider"
      );
      const { getMappingDecisionRepository, getEstaleComptaEcritureProvider, ecritureEstaleReelle } =
        await import("@/lib/reprise/adapters/router");

      const out: string[] = [];
      const log = (m: string) => out.push(m);
      const ecrire = () => writeFileSync(SORTIE, out.join("\n"), "utf8");

      // --- 1. Plan + decisions --------------------------------------------------------
      const lecture = new ReelEstaleComptaLectureProvider();
      const jeu = await new CoucheTexteComptaExtractionProvider().extraireGrandLivre([
        { nom: "gl.pdf", contenu: new Uint8Array(readFileSync(GL)) },
      ]);
      // PREUVE DE BASCULE (balance 06/05 + RGD) : sans elle, le blocage avant-repartition
      // reprend ses droits - la degradation ne s'applique JAMAIS par defaut.
      const { extraireTextePages } = await import("@/lib/reprise/adapters/shared/pdf-texte");
      const { parserBalance } = await import("@/lib/reprise/adapters/shared/parseur-balance");
      const { parserRgd } = await import("@/lib/reprise/adapters/shared/parseur-rgd");
      copyFileSync(globSync(`${DOSSIER}/Archives/Balance*06 mai 2026.pdf`)[0]!, `${SCRATCH}/balance-0605.pdf`);
      copyFileSync(globSync(`${DOSSIER}/Comptabilité/Reprise/Relev*2026.pdf`)[0]!, `${SCRATCH}/rgd-2026.pdf`);
      const balance = parserBalance(await extraireTextePages(new Uint8Array(readFileSync(`${SCRATCH}/balance-0605.pdf`))));
      const rgd = parserRgd(await extraireTextePages(new Uint8Array(readFileSync(`${SCRATCH}/rgd-2026.pdf`))));
      const totalRgd = rgd.controles.find((c) => c.niveau === "general")?.ttcImprime;

      const revue = await preparerRevueMapping(jeu, "S0303", lecture, undefined, undefined, {
        soldes: balance.soldes,
        ...(balance.dateBascule ? { dateBascule: balance.dateBascule } : {}),
        ...(totalRgd !== undefined ? { totalGeneralRgd: totalRgd } : {}),
      });
      if (!revue.ok) {
        log(`PLAN KO : ${revue.message}`);
        ecrire();
        return;
      }

      let decisions = await getMappingDecisionRepository().lister("S0303");
      let simulation = false;
      if (decisions.length === 0 && process.env.RUNNER_SIMULER === "1") {
        // SIMULATION des 4 clics (jamais utilisee pour la voie reelle) : candidats valides
        // pour les 2 fournisseurs, cibles 47199x resolues contre le plan comptable eStale.
        simulation = true;
        const comptes = await lecture.lireComptes(revue.ref);
        // Racines explicites (4719998/4719999 sur le plan reel - 7 chiffres, cf. contexte).
        const n471998 = comptes.find((c) => ["471998", "4719998"].includes(c.nomenclature.trim()))?.nomenclature;
        const n471999 = comptes.find((c) => ["471999", "4719999"].includes(c.nomenclature.trim()))?.nomenclature;
        if (!n471998 || !n471999) {
          log(`SIMULATION IMPOSSIBLE : comptes 471998/471999 introuvables dans le plan eStale.`);
          ecrire();
          return;
        }
        // 401010 (fournisseur a report seul, revele par le correctif) : la VRAIE decision
        // (creation ou cible) appartient a Sekou ; la simulation le mappe vers un 401
        // existant - meme prefixe, l'agregat de la cible "40" est inchange.
        const n401 = comptes.find((c) => /^401\d{4}$/.test(c.nomenclature.trim()))?.nomenclature;
        decisions = [
          { compteSource: "401011", decision: { type: "valider_candidat" } },
          { compteSource: "401002", decision: { type: "valider_candidat" } },
          { compteSource: "502002", decision: { type: "choisir_cible", nomenclature: n471999 } },
          { compteSource: "502003", decision: { type: "choisir_cible", nomenclature: n471998 } },
          ...(n401
            ? [{ compteSource: "401010", decision: { type: "choisir_cible", nomenclature: n401 } as const }]
            : []),
        ];
        log(`SIMULATION : 4 decisions injectees en memoire (en attente des clics reels).`);
      }
      const plan = appliquerDecisions(revue.plan, decisions);
      log(
        `plan : pretAImporter=${plan.pretAImporter} | erreurs ${plan.erreurs.length} | warnings ${plan.warnings.length} | decisions ${decisions.length}${simulation ? " (SIMULEES)" : " (persistees)"}`,
      );
      if (!plan.pretAImporter) {
        // Le warning de degradation avant-repartition est ATTENDU et n'empeche pas l'import :
        // il est le seul warning tolere (regle Sekou : avertissement, pas blocage).
        const bloquants = [
          ...plan.erreurs,
          ...plan.warnings.filter((w) => !/DEGRADE en avertissement/i.test(w)),
        ];
        if (bloquants.length > 0) {
          log(`ARRET : ${bloquants.length} point(s) encore a trancher :`);
          for (const b of bloquants) log(`  - ${b}`);
          ecrire();
          return;
        }
        log(`seul reste le warning de degradation avant-repartition (attendu) -> on continue.`);
      }

      // --- 2. DRY-REPLAY contre les cinq cibles ---------------------------------------
      const dry = new DryRunEstaleComptaEcritureProvider();
      const rDry = await importerBlocA(jeu, plan, "S0303", {
        lecture,
        ecriture: dry,
        aNouveauxDate: DATE_OUVERTURE,
      });
      if (!rDry.ok) {
        log(`DRY REFUSE : ${rDry.message}`);
        for (const m of rDry.motifs) log(`  - ${m}`);
        ecrire();
        return;
      }
      log(
        `dry : ${rDry.rapport.compteurs.emises} ecritures (ouvertures comprises) | journaux ${JSON.stringify(rDry.rapport.parJournal)}`,
      );

      // Agregation par cible depuis le JOURNAL dry (id compte eStale -> nomenclature).
      const comptes = await lecture.lireComptes(revue.ref);
      const nomenclatureParId = new Map(comptes.filter((c) => c.id).map((c) => [c.id!, c.nomenclature]));
      const soldeParCible = new Map<string, number>(CIBLES.map((c) => [c.prefixe, 0]));
      for (const e of dry.journal) {
        if (e.type !== "creerEcriture") continue;
        const nom = nomenclatureParId.get(e.input.accountID) ?? "?";
        const delta = e.input.mouvement === "debit" ? e.input.montant : -e.input.montant;
        // La cible la plus SPECIFIQUE gagne (471998 avant 47, 473 avant 4...).
        const cible = [...CIBLES].sort((a, b) => b.prefixe.length - a.prefixe.length).find((c) => nom.startsWith(c.prefixe));
        if (cible) soldeParCible.set(cible.prefixe, (soldeParCible.get(cible.prefixe) ?? 0) + delta);
      }
      let dryOk = true;
      log("");
      log("=== dry-replay vs cibles (balance de bascule) ===");
      for (const c of CIBLES) {
        const obtenu = Math.round((soldeParCible.get(c.prefixe) ?? 0) * 100) / 100;
        const ok = Math.abs(obtenu - c.solde) < TOL;
        if (!ok) dryOk = false;
        log(`  ${c.prefixe.padEnd(8)} attendu ${c.solde.toFixed(2).padStart(10)}  obtenu ${obtenu.toFixed(2).padStart(10)}  ${ok ? "OK" : "ECART"}`);
      }
      log(`dry-replay : ${dryOk ? "LES CINQ CIBLES TOMBENT" : "ECART(S) -> RIEN ne doit partir en reel"}`);

      // --- 3. REEL (verrous : env explicite + decisions PERSISTEES + dry vert) ---------
      if (process.env.RUNNER_S0303 !== "reel") {
        log("");
        log("mode DRY seul (RUNNER_S0303 absent) : aucune ecriture reelle.");
        ecrire();
        return;
      }
      if (simulation || !dryOk || !ecritureEstaleReelle()) {
        log("");
        log(
          `REEL REFUSE : ${simulation ? "decisions SIMULEES (les clics reels manquent)" : ""}${!dryOk ? " dry en ecart" : ""}${!ecritureEstaleReelle() ? " gate ESTALE_ECRITURE absent" : ""}.`,
        );
        ecrire();
        return;
      }
      log("");
      log("=== EMISSION REELLE ===");
      const rReel = await importerBlocA(jeu, plan, "S0303", {
        lecture,
        ecriture: getEstaleComptaEcritureProvider(),
        aNouveauxDate: DATE_OUVERTURE,
      });
      if (!rReel.ok) {
        log(`REEL REFUSE : ${rReel.message}`);
        ecrire();
        return;
      }
      log(`emises ${rReel.rapport.compteurs.emises} | succes=${rReel.rapport.succes} | ids captures ${rReel.rapport.ids.length}`);
      if (!rReel.rapport.succes) {
        log(`ARRET en cours d'emission (seq ${rReel.rapport.erreur?.seq}) -> rollback immediat.`);
        const rb = await annulerImport(rReel.rapport.ids);
        log(`rollback : ${rb.supprimes.length} supprimee(s), ${rb.echecs.length} echec(s), complet=${rb.complet}`);
        ecrire();
        return;
      }

      // --- 4. RELECTURE eStale des cinq cibles -> rollback AUTO si une seule manque ----
      const apres = await lecture.lireComptes(revue.ref);
      let reelOk = true;
      log("");
      log("=== relecture eStale vs cibles ===");
      for (const c of CIBLES) {
        const obtenu =
          Math.round(
            apres
              .filter((x) => x.nomenclature.startsWith(c.prefixe))
              .filter((x) => ![...CIBLES].some((autre) => autre.prefixe.length > c.prefixe.length && x.nomenclature.startsWith(autre.prefixe)))
              .reduce((s, x) => s + x.debit - x.credit, 0) * 100,
          ) / 100;
        const ok = Math.abs(obtenu - c.solde) < TOL;
        if (!ok) reelOk = false;
        log(`  ${c.prefixe.padEnd(8)} attendu ${c.solde.toFixed(2).padStart(10)}  obtenu ${obtenu.toFixed(2).padStart(10)}  ${ok ? "OK" : "ECART"}`);
      }
      if (!reelOk) {
        log("UNE CIBLE MANQUE -> ROLLBACK AUTOMATIQUE (protocole Sekou).");
        const rb = await annulerImport(rReel.rapport.ids);
        log(`rollback : ${rb.supprimes.length} supprimee(s), ${rb.echecs.length} echec(s), complet=${rb.complet}`);
      } else {
        log("LES CINQ CIBLES TOMBENT EN REEL : bloc A importe et verifie.");
        log(`ids captures (rollback possible) : ${rReel.rapport.ids.length} ecritures.`);
      }
      ecrire();
    },
    900_000,
  );
});
