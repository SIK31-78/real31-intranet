import { describe, it, expect } from "vitest";
import { calculerTrimestreGestionCourante } from "./gestion-courante";

describe("calculerTrimestreGestionCourante", () => {
  it("honoraires = annuel TTC / 4 / 1,2 (HT), timbres = annuel / 4 (sans TVA)", () => {
    // S004 : 4895 TTC annuel, 369 timbres.
    const r = calculerTrimestreGestionCourante(4895, 369);
    expect(r.honorairesHt).toBeCloseTo(4895 / 4 / 1.2, 5); // 1019.79
    expect(r.timbres).toBeCloseTo(92.25, 5);
  });

  it("les timbres ne subissent pas la TVA", () => {
    const r = calculerTrimestreGestionCourante(0, 480);
    expect(r.timbres).toBe(120); // 480 / 4, pas de /1.2
  });

  it("gere un forfait postaux nul", () => {
    const r = calculerTrimestreGestionCourante(1200, 0);
    expect(r.honorairesHt).toBeCloseTo(250, 5); // 1200/4/1.2
    expect(r.timbres).toBe(0);
  });

  it("rejette des montants negatifs", () => {
    expect(() => calculerTrimestreGestionCourante(-1, 0)).toThrow();
    expect(() => calculerTrimestreGestionCourante(0, -1)).toThrow();
  });

  it("frais postaux reels : aucun timbre facture (Fix B), honoraires inchanges", () => {
    const r = calculerTrimestreGestionCourante(4800, 400, true);
    expect(r.timbres).toBe(0); // frais refactures au reel ailleurs
    expect(r.honorairesHt).toBeCloseTo(4800 / 4 / 1.2, 5); // honoraires normaux
  });
});
