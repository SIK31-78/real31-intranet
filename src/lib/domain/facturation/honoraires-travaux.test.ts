import { describe, it, expect } from "vitest";
import { calculerHonorairesTravaux } from "./honoraires-travaux";

describe("calculerHonorairesTravaux", () => {
  it("mode pourcentage : HT = montant des travaux HT x pourcentage", () => {
    const r = calculerHonorairesTravaux({
      mode: "pourcentage",
      montantTravauxHt: 10_000,
      pourcentage: 5,
    });
    expect(r.montantHt).toBeCloseTo(500, 5);
  });

  it("mode pourcentage : calcule directement en HT (pas d'aller-retour TTC)", () => {
    // Cas ou l'aller-retour x1,2 puis /1,2 du legacy pouvait deriver.
    const r = calculerHonorairesTravaux({
      mode: "pourcentage",
      montantTravauxHt: 3333.33,
      pourcentage: 7.5,
    });
    expect(r.montantHt).toBeCloseTo(3333.33 * 0.075, 10);
  });

  it("mode forfait : le montant saisi est TTC, on stocke le HT", () => {
    const r = calculerHonorairesTravaux({ mode: "forfait", forfaitTtc: 1200 });
    expect(r.montantHt).toBeCloseTo(1000, 5);
  });

  it("accepte un pourcentage nul (aucun honoraire)", () => {
    const r = calculerHonorairesTravaux({
      mode: "pourcentage",
      montantTravauxHt: 10_000,
      pourcentage: 0,
    });
    expect(r.montantHt).toBe(0);
  });

  it("rejette un montant de travaux negatif", () => {
    expect(() =>
      calculerHonorairesTravaux({ mode: "pourcentage", montantTravauxHt: -1, pourcentage: 5 }),
    ).toThrow();
  });

  it("rejette un forfait negatif", () => {
    expect(() => calculerHonorairesTravaux({ mode: "forfait", forfaitTtc: -1 })).toThrow();
  });
});
