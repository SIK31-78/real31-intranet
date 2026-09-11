// Le cycle reproduit une regle du legacy qui SEMBLE fausse et ne l'est pas :
// le nouveau contrat commence le lendemain de la fin du precedent, mais se termine
// un an apres cette fin - donc il dure ~364 jours. C'est l'arrondi de
// `calculerDureeContrat` qui rattrape, et le document affiche bien « 1 an ».
// Ces tests verrouillent le couple, sinon quelqu'un « corrigera » le decalage un jour
// et tous les contrats imprimes changeront.

import { describe, expect, it } from "vitest";
import { cycleSuivant } from "./cycle-contrat";
import { dureeContratTexte } from "./duree-contrat";

describe("cycleSuivant", () => {
  it("enchaine sur le lendemain et finit un an apres la fin precedente", () => {
    expect(cycleSuivant("2026-06-30")).toEqual({ debut: "2026-07-01", fin: "2027-06-30" });
  });

  it("le cycle ainsi calcule s'affiche bien « 1 an » (l'arrondi rattrape les 364 jours)", () => {
    const { debut, fin } = cycleSuivant("2026-06-30");
    expect(dureeContratTexte(debut, fin)).toBe("1 an, 0 mois, 0 jour");
  });

  it("passe une fin d'annee civile", () => {
    expect(cycleSuivant("2026-12-31")).toEqual({ debut: "2027-01-01", fin: "2027-12-31" });
  });

  it("traverse un 29 fevrier sans deborder sur mars", () => {
    // 2028 est bissextile : la fin tombe pile sur le 29.
    expect(cycleSuivant("2027-02-28")).toEqual({ debut: "2027-03-01", fin: "2028-02-28" });
  });

  it("ramene un 29 fevrier au 28 quand l'annee d'arrivee n'est pas bissextile", () => {
    // Sans garde, setUTCFullYear ferait glisser au 01/03/2029 : une date de fin que
    // le gestionnaire ne reconnaitrait pas.
    expect(cycleSuivant("2028-02-29")).toEqual({ debut: "2028-03-01", fin: "2029-02-28" });
  });

  it("refuse une date illisible plutot que de produire un contrat de travers", () => {
    expect(() => cycleSuivant("30/06/2026")).toThrow(/illisible/);
    expect(() => cycleSuivant("")).toThrow(/illisible/);
  });
});
