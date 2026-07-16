import { describe, it, expect } from "vitest";
import { calculerDepassementCs } from "./depassement-cs";
import type { Creneau } from "./commun";

/** Fabrique un creneau sur une seule journee (2026-05-12) a partir des heures/minutes. */
function creneau(hDebut: number, mDebut: number, hFin: number, mFin: number): Creneau {
  return {
    jourDebut: "2026-05-12",
    heureDebut: hDebut,
    minuteDebut: mDebut,
    jourFin: "2026-05-12",
    heureFin: hFin,
    minuteFin: mFin,
  };
}

describe("calculerDepassementCs", () => {
  it("ne facture que les heures au-dela de la franchise contractuelle", () => {
    // Reunion de 3h00 pile, franchise 2h -> 1h facturable.
    const r = calculerDepassementCs({
      reunion: creneau(18, 0, 21, 0),
      franchiseHeures: 2,
      tarifHoraireTtc: 60,
    });
    expect(r.heuresArrondies).toBe(3);
    expect(r.heuresFacturables).toBe(1);
    expect(r.montantTtc).toBe(60);
    expect(r.montantHt).toBeCloseTo(50, 5);
  });

  it("arrondit toute fraction d'heure entamee a la demi-heure superieure", () => {
    // 2h10 -> arrondi a 2h30.
    const r = calculerDepassementCs({
      reunion: creneau(18, 0, 20, 10),
      franchiseHeures: 0,
      tarifHoraireTtc: 40,
    });
    expect(r.heuresArrondies).toBe(2.5);
    expect(r.heuresFacturables).toBe(2.5);
    expect(r.montantTtc).toBe(100);
    expect(r.montantHt).toBeCloseTo(83.3333, 3);
  });

  it("ne facture rien si la reunion ne depasse pas la franchise", () => {
    const r = calculerDepassementCs({
      reunion: creneau(18, 0, 19, 0),
      franchiseHeures: 2,
      tarifHoraireTtc: 60,
    });
    expect(r.heuresFacturables).toBe(0);
    expect(r.montantTtc).toBe(0);
    expect(r.montantHt).toBe(0);
  });

  it("traite une duree pile egale a la demi-heure sans sur-arrondir", () => {
    // 2h30 exactement -> reste 2h30 (pas de tranche entamee).
    const r = calculerDepassementCs({
      reunion: creneau(18, 0, 20, 30),
      franchiseHeures: 0,
      tarifHoraireTtc: 40,
    });
    expect(r.heuresArrondies).toBe(2.5);
  });

  it("rejette un creneau invalide (fin avant debut)", () => {
    expect(() =>
      calculerDepassementCs({
        reunion: creneau(20, 0, 19, 0),
        franchiseHeures: 0,
        tarifHoraireTtc: 60,
      }),
    ).toThrow();
  });
});
