// Tests de la regle PPT de la fiche (Sekou 2026-07-28) : pas d'alerte avant les
// 13 ans de l'immeuble (echeance 15 ans - fenetre 2 ans), orange dans la fenetre,
// rouge une fois l'echeance depassee, statu quo si l'annee est inconnue.

import { describe, expect, it } from "vitest";
import { itemConformitePpt } from "./conformite-ppt";

const ANNEE = 2026;

describe("itemConformitePpt", () => {
  it("PPT vote -> 'PPT voté' (ok), quelle que soit l'annee", () => {
    expect(itemConformitePpt(true, 1990, ANNEE)).toEqual({ libelle: "PPT voté", etat: "ok" });
    expect(itemConformitePpt(true, undefined, ANNEE)).toEqual({ libelle: "PPT voté", etat: "ok" });
  });

  it("pptVote inconnu -> aucun item (on n'invente pas)", () => {
    expect(itemConformitePpt(undefined, 1990, ANNEE)).toBeNull();
  });

  it("immeuble recent (echeance a plus de 2 ans) -> AUCUNE alerte", () => {
    // Construit en 2020 -> echeance 2035 : rien.
    expect(itemConformitePpt(false, 2020, ANNEE)).toBeNull();
    // Construit en 2014 -> echeance 2029 (a 3 ans) : rien non plus.
    expect(itemConformitePpt(false, 2014, ANNEE)).toBeNull();
  });

  it("echeance dans la fenetre de 2 ans -> 'PPT à prévoir en XXXX' (attention)", () => {
    // Construit en 2013 -> echeance 2028 (dans 2 ans).
    expect(itemConformitePpt(false, 2013, ANNEE)).toEqual({
      libelle: "PPT à prévoir en 2028", etat: "attention",
    });
    // Construit en 2011 -> echeance 2026 (cette annee) : encore orange.
    expect(itemConformitePpt(false, 2011, ANNEE)).toEqual({
      libelle: "PPT à prévoir en 2026", etat: "attention",
    });
  });

  it("echeance depassee -> 'PPT à prévoir depuis XXXX' (ko / rouge)", () => {
    // Construit en 1990 -> echeance 2005, largement depassee.
    expect(itemConformitePpt(false, 1990, ANNEE)).toEqual({
      libelle: "PPT à prévoir depuis 2005", etat: "ko",
    });
  });

  it("annee de construction inconnue -> comportement historique 'PPT à programmer'", () => {
    expect(itemConformitePpt(false, undefined, ANNEE)).toEqual({
      libelle: "PPT à programmer", etat: "attention",
    });
  });
});
