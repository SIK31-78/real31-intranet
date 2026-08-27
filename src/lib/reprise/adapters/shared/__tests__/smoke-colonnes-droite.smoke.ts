// SMOKE test manuel : parsing REEL du grand livre "colonnes a droite" de S0304 (l'ancien
// syndic du sortant, PDF local hors repo - regle R12 : jamais copie ici). Aucun reseau.
// Ne loggue QUE des agregats (compteurs, totaux, ecarts) - JAMAIS de libelle/nom (PII).
//
// Chiffres attendus (mesures par le script Python du skill estale-migration, valides au
// centime lors de la reprise S0304) :
//   2 535 ecritures ; total debit = total credit = 969 466,09 ; 232 totaux imprimes a
//   0 ecart ; 95 comptes avec report ; dates de valeur du 01/07/2024 au 27/02/2025.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CHEMIN_GL =
  "C:/Users/SekouKOMA/REAL 31/Syndic - ML/S304 - De Gaulle 93/Mes archives/GL/GRAND_LIVRE_20240701-20250630_projet.pdf";

describe("smoke colonnes a droite (GL reel S0304, lecture seule)", () => {
  it(
    "reproduit les chiffres de validation du script Python",
    async () => {
      const { extraireTextePages } = await import("../pdf-texte");
      const { detecterFormatColonnesDroite, parserGrandLivreColonnesDroite } = await import(
        "../parseur-grand-livre-colonnes-droite"
      );
      const { normaliserGrandLivre } = await import("../normaliser-compta");
      const { verifierEquilibreGrandLivre, plageDatesEcritures } = await import("@/lib/reprise/domain/ecriture");
      const { verifierTotauxParCompte } = await import("@/lib/reprise/domain/controle-comptes");

      const pages = await extraireTextePages(new Uint8Array(readFileSync(CHEMIN_GL)));
      expect(detecterFormatColonnesDroite(pages)).toBe(true);

      const parse = parserGrandLivreColonnesDroite(pages);
      const jeu = normaliserGrandLivre({ lignes: parse.lignes, notes: [] });
      const equ = verifierEquilibreGrandLivre(jeu.lignes);
      const controle = verifierTotauxParCompte(jeu.lignes, parse.controles ?? []);
      const plage = plageDatesEcritures(jeu.lignes);
      const totalDebit = jeu.lignes.reduce((s, l) => s + (l.sens === "debit" ? l.montant : 0), 0);
      const totalCredit = jeu.lignes.reduce((s, l) => s + (l.sens === "credit" ? l.montant : 0), 0);
      const nbReports = (parse.controles ?? []).filter(
        (c) => (c.reportDebit ?? 0) !== 0 || (c.reportCredit ?? 0) !== 0,
      ).length;
      const nbTotaux = (parse.controles ?? []).filter(
        (c) => c.totalDebit !== undefined || c.totalCredit !== undefined,
      ).length;

      console.log("=== ecritures      :", jeu.lignes.length);
      console.log("=== total debit    :", totalDebit.toFixed(2));
      console.log("=== total credit   :", totalCredit.toFixed(2));
      console.log("=== equilibre      :", equ.ecart);
      console.log("=== totaux comptes :", nbTotaux, "| en ecart :", controle.nbEnEcart);
      console.log("=== reports        :", nbReports);
      console.log("=== plage dates    :", plage.min, "->", plage.max);
      console.log("=== anomalies      :", parse.anomalies.length);
      for (const a of parse.anomalies.slice(0, 10)) {
        // Diagnostic local uniquement (peut porter un nom) : jamais en CI, jamais en note.
        console.log("    anomalie p", a.page, ":", a.texte.slice(0, 90));
      }

      expect(jeu.lignes.length).toBe(2535);
      expect(totalDebit.toFixed(2)).toBe("969466.09");
      expect(totalCredit.toFixed(2)).toBe("969466.09");
      expect(nbTotaux).toBe(232);
      expect(controle.nbEnEcart).toBe(0);
      expect(nbReports).toBe(95);
      expect(plage.min).toBe("2024-07-01");
      expect(plage.max).toBe("2025-02-27");
      expect(parse.anomalies).toEqual([]);
    },
    120_000,
  );
});
