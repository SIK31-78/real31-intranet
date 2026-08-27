// SMOKE test manuel : ASSEMBLAGE REEL de l'exercice 2024-2025 de S0304, a cheval sur deux
// syndics - le predecesseur (GL "colonnes a droite", 01/07/2024 -> 27/02/2025) puis le
// sortant Matera (GL positions, 25/02 -> 30/06/2025) qui a repris EN SOLDES. PDF locaux
// hors repo (R12). Aucun reseau. Agregats seulement (PII-free).
//
// References (cas-s0304-marronniers.md) : GL Matera 2024-2025 = 670 ecritures, 208 totaux
// imprimes a 0 ecart ; reports Matera au 25/02 : 93 067,20 de travaux et 141 352,50
// d'appels deja presents dans le detail du predecesseur (le double comptage que l'omission
// evite) ; rompus residuels du raccord : 0,07 en classe 1, 0,18 en classe 5.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOSSIER = "C:/Users/SekouKOMA/REAL 31/Syndic - ML/S304 - De Gaulle 93";
const GL_PRED = `${DOSSIER}/Mes archives/GL/GRAND_LIVRE_20240701-20250630_projet.pdf`;
const GL_SUCC = `${DOSSIER}/Grand livre - Exercice 2024 - 2025.pdf`;

describe("smoke assemblage multi-syndics (exercice 2024-2025 reel de S0304)", () => {
  it(
    "assemble les deux GL : reports du sortant omis et traces, raccord par classe aux chiffres du cas reel",
    async () => {
      const { CoucheTexteComptaExtractionProvider } = await import(
        "@/lib/reprise/adapters/compta-extraction/couche-texte-provider"
      );
      const { assemblerExerciceMultiSyndics } = await import("@/lib/reprise/domain/assemblage-gl");
      const { balanceDesEcritures } = await import("@/lib/reprise/domain/ecriture");
      const { verifierTotauxParCompte } = await import("@/lib/reprise/domain/controle-comptes");

      const provider = new CoucheTexteComptaExtractionProvider();
      const pred = await provider.extraireGrandLivre([
        { nom: "gl-pred.pdf", contenu: new Uint8Array(readFileSync(GL_PRED)) },
      ]);
      const succ = await provider.extraireGrandLivre([
        { nom: "gl-succ.pdf", contenu: new Uint8Array(readFileSync(GL_SUCC)) },
      ]);

      console.log("=== pred :", pred.lignes.length, "ecritures |", (pred.controles ?? []).length, "controles");
      console.log("=== succ :", succ.lignes.length, "ecritures |", (succ.controles ?? []).length, "controles");
      for (const n of succ.notes) console.log("    note succ :", n);
      {
        const bs = balanceDesEcritures(succ.lignes);
        for (const cl of [1, 2, 3, 4, 5, 6, 7] as const) {
          const a = bs.parClasse[cl];
          if (a.debit || a.credit) console.log(`    succ classe ${cl} : D ${a.debit.toFixed(2)} / C ${a.credit.toFixed(2)}`);
        }
        const ctl = verifierTotauxParCompte(succ.lignes, succ.controles ?? []);
        for (const e of ctl.enEcart.slice(0, 12)) {
          console.log(
            `    ecart succ ${e.compte} : calcule D ${e.debitCalcule.toFixed(2)} / C ${e.creditCalcule.toFixed(2)}` +
              ` | imprime D ${(e.debitImprime ?? 0).toFixed(2)} / C ${(e.creditImprime ?? 0).toFixed(2)}` +
              ` | reports D ${e.reportDebit.toFixed(2)} / C ${e.reportCredit.toFixed(2)}`,
          );
        }
      }
      expect(pred.lignes.length).toBe(2535);
      expect(succ.lignes.length).toBe(670);

      const { jeu, rapport } = assemblerExerciceMultiSyndics([
        { label: "GL predecesseur 2024-2025", jeu: pred },
        { label: "GL Matera 2024-2025", jeu: succ },
      ]);

      const b = balanceDesEcritures(jeu.lignes);
      const controle = verifierTotauxParCompte(jeu.lignes, jeu.controles ?? []);
      console.log("=== assemble :", jeu.lignes.length, "ecritures | equilibre ecart", b.ecart);
      console.log("=== reports omis :", rapport.reportsOmis.length, "| debit", rapport.totalOmisDebit.toFixed(2), "| credit", rapport.totalOmisCredit.toFixed(2));
      console.log("=== controles par compte :", controle.nbComptesControles, "| en ecart :", controle.nbEnEcart);
      for (const r of rapport.jonctions[0]!.parClasse) {
        console.log(
          `=== classe ${r.classe} : pred ${r.soldePredecesseur.toFixed(2)} vs reports succ ${r.reportsSuccesseur.toFixed(2)} -> ecart ${r.ecart.toFixed(2)}`,
        );
      }
      console.log("=== ecart total jonction :", rapport.jonctions[0]!.ecartTotal.toFixed(2));

      expect(jeu.lignes.length).toBe(2535 + 670);
      // Le filet "report + ecritures == total imprime" reste juste apres ajustement : les
      // 440 comptes (232 + 208) se reconcilient au centime.
      expect(controle.nbComptesControles).toBe(440);
      expect(controle.nbEnEcart).toBe(0);
      expect(rapport.reportsOmis.length).toBe(101);

      // LE RACCORD PAR CLASSE - les chiffres du cas reel (cas-s0304-marronniers.md) :
      const parClasse = new Map(rapport.jonctions[0]!.parClasse.map((r) => [r.classe, r]));
      // classe 1 : rompus residuel de 0,07 (mesure lors de la reprise).
      expect(parClasse.get(1)!.ecart).toBeCloseTo(0.07, 2);
      // classe 5 -> classe 4 : la tresorerie du predecesseur (52 552,60) reprise en compte
      // d'attente par le sortant ("banque ancien syndic") ; rompus de 0,18 entre les deux.
      expect(parClasse.get(5)!.soldePredecesseur).toBeCloseTo(52552.6, 2);
      expect(parClasse.get(5)!.ecart).toBeCloseTo(-52552.6, 2);
      expect(parClasse.get(4)!.ecart).toBeCloseTo(52552.42, 2);
      // classe 6 : le predecesseur porte 213 997,56 de charges (le chiffre du cas reel) ; le
      // sortant n'en a repris en REPORTS que les travaux en cours (93 067,20).
      expect(parClasse.get(6)!.soldePredecesseur).toBeCloseTo(213997.56, 2);
      expect(parClasse.get(6)!.reportsSuccesseur).toBeCloseTo(93067.2, 2);

      // Les reports omis de Matera NE s'equilibrent PAS (net -104 706,95) : Matera a AUSSI
      // resume la periode Foncia en ECRITURES datees du 25/02 ("Depense avant le 25/02/2025",
      // verifie : 818,23 d'electricite = le poste Foncia au centime). L'assemblage porte donc
      // cet ecart d'equilibre, EXPLIQUE par le rapport - le traitement de ces ecritures de
      // resume est le prochain increment (decision metier a trancher).
      const netOmis = rapport.totalOmisDebit - rapport.totalOmisCredit;
      expect(b.ecart).toBeCloseTo(-netOmis, 2);
      expect(rapport.notes.some((n) => n.includes("ne s'equilibrent pas"))).toBe(true);
    },
    180_000,
  );
});
