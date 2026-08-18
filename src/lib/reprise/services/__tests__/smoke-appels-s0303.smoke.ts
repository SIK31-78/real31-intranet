// SMOKE REEL du BLOC C (appels de fonds) sur la copropriete S0303 reprise de Matera.
// Parse les VRAIS PDF (un par coproprietaire et par trimestre) et confronte les totaux parses au
// FILET mesure par Sekou sur la balance : par trimestre appele, cle "Charges generales" =
// 1 974,91 EUR et cle "CHARGES BATIMENT - A" = 2 549,66 EUR, soit 4 524,57 EUR le trimestre et
// 9 049,14 EUR sur les deux trimestres de l'exercice 2026.
//
// PII : le rapport et les logs ne contiennent QUE des agregats - periodes, numeros de lot,
// libelles de cle, compteurs, montants. Jamais un nom de coproprietaire, jamais un nom de fichier
// (les PDF Matera sont nommes d'apres le coproprietaire).
//
// Les PDF ne peuvent pas entrer au depot. Extraire d'abord l'archive du syndic hors du depot :
//   unzip "…/Archives/Mes appels de fonds-*.zip" -d <dossier>
// puis lancer :
//   APPELS_FONDS_DIR=<dossier> npx vitest run --config vitest.smoke.config.mts \
//     src/lib/reprise/services/__tests__/smoke-appels-s0303.smoke.ts

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { extraireTextePages } from "@/lib/reprise/adapters/shared/pdf-texte";
import { parserAppelsFonds } from "@/lib/reprise/adapters/shared/parseur-appels-fonds";
import type { NoteParsageAppels } from "@/lib/reprise/adapters/shared/parseur-appels-fonds";
import {
  TOLERANCE_EUR,
  appelsEnEcart,
  appelsLotsIncomplets,
  arrondi2,
  clefRegroupement,
  ecartSousTotaux,
  lignesSansCle,
  lotsAppel,
  totalGeneral,
  totauxParCle,
  totauxParNature,
  totauxParNatureEtCle,
  totauxParPeriode,
} from "@/lib/reprise/domain/appel-fonds";
import type { AppelFonds } from "@/lib/reprise/domain/appel-fonds";

/** Dossier des PDF extraits (hors depot). Sans lui, le smoke se saute proprement. */
const RACINE = process.env.APPELS_FONDS_DIR ?? "";

/** Ou ecrire le rapport d'agregats (scratchpad par defaut). */
const DOSSIER_RAPPORT = process.env.APPELS_FONDS_RAPPORT ?? tmpdir();

/** Les deux trimestres de l'exercice repris : le filet ne porte que sur ceux-la. */
const PERIODES_EXERCICE = ["01/01/2026", "01/04/2026"];

/** Filet de Sekou, mesure sur la balance reelle (EUR, par trimestre appele). */
const FILET_PAR_TRIMESTRE = [
  { cle: "Charges generales", attendu: 1974.91 },
  { cle: "CHARGES BATIMENT - A", attendu: 2549.66 },
];
const FILET_TOTAL_DEUX_TRIMESTRES = 9049.14;

/** Un releve de compte n'est PAS un appel : meme dossier, autre document, a ecarter. */
function estAppelDeFonds(nom: string): boolean {
  if (!nom.toLowerCase().endsWith(".pdf")) return false;
  return !clefRegroupement(nom).includes("releve de compte");
}

function listerPdf(racine: string): string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) parcourir(chemin);
      else if (estAppelDeFonds(e.name)) trouves.push(chemin);
    }
  };
  parcourir(racine);
  return trouves.sort();
}

const disponible = RACINE !== "" && existsSync(RACINE);

describe.skipIf(!disponible)("smoke appels de fonds S0303 (PDF reels)", () => {
  it("parse tous les appels et confronte les totaux au filet de la balance", async () => {
    const fichiers = listerPdf(RACINE);
    expect(fichiers.length).toBeGreaterThan(0);

    const appels: AppelFonds[] = [];
    const notes: NoteParsageAppels[] = [];
    let nbDocsSansAppel = 0;

    for (let i = 0; i < fichiers.length; i++) {
      // `source` = un index anonyme, JAMAIS le nom de fichier (il porte le nom du coproprietaire).
      const pages = await extraireTextePages(new Uint8Array(readFileSync(fichiers[i]!)));
      const r = parserAppelsFonds(pages, `doc-${String(i + 1).padStart(3, "0")}`);
      if (r.appels.length === 0) nbDocsSansAppel++;
      appels.push(...r.appels);
      notes.push(...r.notes);
    }

    const exercice = appels.filter((a) => PERIODES_EXERCICE.includes(a.periode));
    const parCle = totauxParCle(exercice);
    const parNatureCle = totauxParNatureEtCle(exercice);

    // --- Confrontation au filet : par cle, on ne retient QUE les provisions de charges courantes.
    // Le fonds travaux est reparti sur la MEME cle "Charges generales" mais atterrit sur un autre
    // compte de produit : l'additionner donnerait un total juste et un import faux.
    const courantes = parNatureCle.filter((g) => clefRegroupement(g.libelle).includes("charges courantes"));
    const confrontation = FILET_PAR_TRIMESTRE.map((f) => {
      const groupe = courantes.find((g) => clefRegroupement(g.libelle).includes(clefRegroupement(f.cle)));
      const parseSurDeuxTrimestres = groupe?.montant ?? 0;
      const attenduDeuxTrimestres = arrondi2(f.attendu * 2);
      return {
        cle: f.cle,
        nbLignes: groupe?.nbLignes ?? 0,
        attenduParTrimestre: f.attendu,
        attenduDeuxTrimestres,
        parseDeuxTrimestres: parseSurDeuxTrimestres,
        ecart: arrondi2(parseSurDeuxTrimestres - attenduDeuxTrimestres),
      };
    });
    const totalCourantes = arrondi2(courantes.reduce((s, g) => s + g.montant, 0));
    const ecartTotal = arrondi2(totalCourantes - FILET_TOTAL_DEUX_TRIMESTRES);

    // --- Controles internes (independants du filet) : chaque appel doit retomber sur son propre
    // total imprime, et couvrir tous les lots qu'il annonce en tete.
    const enEcart = appelsEnEcart(appels);
    const lotsIncomplets = appelsLotsIncomplets(appels);

    const lignes: string[] = [];
    const dire = (s: string): void => {
      lignes.push(s);
      console.log(s);
    };

    dire(`# Smoke appels de fonds S0303 — ${new Date().toISOString()}`);
    dire("");
    dire(`Documents lus : ${fichiers.length} (releves de compte ecartes)`);
    dire(`Documents sans appel reconnu : ${nbDocsSansAppel}`);
    dire(`Appels parses : ${appels.length} | lignes de detail : ${appels.reduce((s, a) => s + a.lignes.length, 0)}`);
    dire(`Lignes sans cle de repartition : ${lignesSansCle(appels)}`);
    dire("");
    dire("## Totaux par periode (toutes natures)");
    for (const g of totauxParPeriode(appels)) {
      dire(`  ${g.libelle} : ${g.montant.toFixed(2)} EUR sur ${g.nbLignes} ligne(s)`);
    }
    dire("");
    dire(`## Exercice repris (${PERIODES_EXERCICE.join(" + ")}) : ${exercice.length} appel(s)`);
    dire(`Total toutes natures : ${totalGeneral(exercice).toFixed(2)} EUR`);
    dire("");
    dire("### Par nature de provision");
    for (const g of totauxParNature(exercice)) {
      dire(`  ${g.libelle} : ${g.montant.toFixed(2)} EUR sur ${g.nbLignes} ligne(s)`);
    }
    dire("");
    dire("### Par cle de repartition (toutes natures confondues)");
    for (const g of parCle) {
      dire(`  ${g.libelle} : ${g.montant.toFixed(2)} EUR sur ${g.nbLignes} ligne(s)`);
    }
    dire("");
    dire("### Par nature + cle (le decoupage qui compte pour l'import)");
    for (const g of parNatureCle) {
      dire(`  ${g.libelle} : ${g.montant.toFixed(2)} EUR sur ${g.nbLignes} ligne(s)`);
    }
    dire("");
    // Le "Montant a repartir" imprime est le BUDGET de la cle pour le trimestre : c'est lui que le
    // filet de Sekou reprend. On le restitue trimestre par trimestre, parce qu'il n'est PAS le
    // meme aux deux trimestres - et c'est toute l'explication de l'ecart residuel.
    dire("### Montant a repartir imprime, par periode et par cle (budget du trimestre)");
    const budgets = new Map<string, Set<number>>();
    for (const a of exercice) {
      for (const l of a.lignes) {
        if (l.montantARepartir === undefined || !l.cle) continue;
        const clef = `${a.periode} | ${l.nature} | ${l.cle}`;
        const vus = budgets.get(clef) ?? new Set<number>();
        vus.add(l.montantARepartir);
        budgets.set(clef, vus);
      }
    }
    for (const [clef, vus] of [...budgets.entries()].sort()) {
      const valeurs = [...vus].map((v) => v.toFixed(2)).join(" / ");
      dire(`  ${clef} : ${valeurs}${vus.size > 1 ? "  <- INCOHERENT (plusieurs budgets pour une meme cle)" : ""}`);
    }
    dire("");
    dire("## Confrontation au filet (provisions de charges courantes seules)");
    for (const c of confrontation) {
      dire(
        `  ${c.cle} : parse ${c.parseDeuxTrimestres.toFixed(2)} | attendu ${c.attenduDeuxTrimestres.toFixed(2)} ` +
          `(${c.attenduParTrimestre.toFixed(2)} x 2) | ecart ${c.ecart.toFixed(2)} EUR sur ${c.nbLignes} ligne(s)`,
      );
    }
    dire(
      `  TOTAL : parse ${totalCourantes.toFixed(2)} | attendu ${FILET_TOTAL_DEUX_TRIMESTRES.toFixed(2)} | ` +
        `ecart ${ecartTotal.toFixed(2)} EUR`,
    );
    dire("");
    dire("## Controles internes");
    dire(`Appels dont la somme des quote-parts ne retombe pas sur le total imprime : ${enEcart.length}`);
    for (const c of enEcart) {
      dire(`  periode ${c.periode} lots ${c.lots.join("+")} : ${c.total.toFixed(2)} vs ${c.totalImprime?.toFixed(2)} (ecart ${c.ecart?.toFixed(2)})`);
    }
    for (const c of enEcart) {
      for (const e of c.ecartsLot) {
        dire(`  periode ${c.periode} lot ${e.lot} : ${e.total.toFixed(2)} vs total du lot imprime ${e.imprime.toFixed(2)} (ecart ${e.ecart.toFixed(2)})`);
      }
    }
    dire(`Appels dont le detail ne couvre pas tous les lots annonces : ${lotsIncomplets.length}`);
    for (const c of lotsIncomplets) {
      dire(`  periode ${c.periode} lots vus ${c.lots.join("+")}`);
    }
    const sousTotauxFaux = appels
      .map((a) => ({ a, ecart: ecartSousTotaux(a) }))
      .filter((x) => x.ecart !== undefined && Math.abs(x.ecart) > TOLERANCE_EUR);
    dire(`Appels dont les sous-totaux annonces ne font pas le montant de l'appel : ${sousTotauxFaux.length}`);
    for (const x of sousTotauxFaux) {
      dire(`  periode ${x.a.periode} lots ${lotsAppel(x.a).join("+")} : ecart ${x.ecart?.toFixed(2)}`);
    }
    const sansTotal = appels.filter((a) => a.totalImprime === undefined).length;
    dire(`Appels sans montant d'appel lisible en tete : ${sansTotal}`);
    dire("");
    dire(`## Notes de diagnostic du parseur : ${notes.length}`);
    const parMotif = new Map<string, number>();
    for (const n of notes) parMotif.set(n.motif, (parMotif.get(n.motif) ?? 0) + 1);
    for (const [motif, n] of parMotif) dire(`  x${n} — ${motif}`);

    mkdirSync(DOSSIER_RAPPORT, { recursive: true });
    const chemin = join(DOSSIER_RAPPORT, "rapport-appels-s0303.md");
    writeFileSync(chemin, lignes.join("\n"), "utf8");
    console.log(`\nRapport ecrit : ${chemin}`);

    // Le smoke AFFICHE toujours les ecarts ; il n'echoue que sur ce qui est structurellement faux.
    expect(nbDocsSansAppel).toBe(0);
    expect(lignesSansCle(appels)).toBe(0);
    expect(enEcart).toHaveLength(0);
    expect(lotsIncomplets).toHaveLength(0);
    expect(sousTotauxFaux).toHaveLength(0);
    expect(sansTotal).toBe(0);
  }, 300000);
});
