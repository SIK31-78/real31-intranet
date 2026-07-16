import { describe, it, expect } from "vitest";
import { calculerDepassementAg } from "./depassement-ag";
import type { Creneau } from "./commun";

/** AG sur une seule journee (2026-03-15). Plage contractuelle par defaut 10h-20h. */
function ag(hDebut: number, mDebut: number, hFin: number, mFin: number): Creneau {
  return {
    jourDebut: "2026-03-15",
    heureDebut: hDebut,
    minuteDebut: mDebut,
    jourFin: "2026-03-15",
    heureFin: hFin,
    minuteFin: mFin,
  };
}

const PLAGE = { debutMinAgHeure: 10, finMaxAgHeure: 20 };

describe("calculerDepassementAg", () => {
  it("cas 1 : entierement dans la plage, plus long que la duree contractuelle", () => {
    // 10h->20h = 10h reelles, duree contractuelle 8h -> 2h de depassement.
    const r = calculerDepassementAg({
      assemblee: ag(10, 0, 20, 0),
      dureeAgContractuelleHeures: 8,
      ...PLAGE,
      tarifHoraireTtc: 100,
    });
    expect(r.depassementDansPlageHeures).toBe(2);
    expect(r.depassementHorsPlageHeures).toBe(0);
    expect(r.totalDepassementHeures).toBe(2);
    expect(r.montantTtc).toBe(200);
    expect(r.montantHt).toBeCloseTo(166.6667, 3);
  });

  it("cas 2 : commence dans la plage, finit apres la borne (exces + hors plage)", () => {
    // 10h->22h : 10h dans la plage (dep 2h) + 2h hors plage -> 4h au total.
    const r = calculerDepassementAg({
      assemblee: ag(10, 0, 22, 0),
      dureeAgContractuelleHeures: 8,
      ...PLAGE,
      tarifHoraireTtc: 100,
    });
    expect(r.depassementDansPlageHeures).toBe(2);
    expect(r.depassementHorsPlageHeures).toBe(2);
    expect(r.totalDepassementHeures).toBe(4);
    expect(r.montantTtc).toBe(400);
  });

  it("aucun depassement si la reunion tient dans la duree contractuelle", () => {
    // 11h->18h = 7h, duree contractuelle 8h.
    const r = calculerDepassementAg({
      assemblee: ag(11, 0, 18, 0),
      dureeAgContractuelleHeures: 8,
      ...PLAGE,
      tarifHoraireTtc: 100,
    });
    expect(r.totalDepassementHeures).toBe(0);
    expect(r.montantTtc).toBe(0);
    expect(r.montantHt).toBe(0);
  });

  it("cas 3 : reunion entierement hors des bornes -> tout compte", () => {
    // 21h->23h, entierement apres la borne de fin (20h) -> 2h de depassement.
    const r = calculerDepassementAg({
      assemblee: ag(21, 0, 23, 0),
      dureeAgContractuelleHeures: 8,
      ...PLAGE,
      tarifHoraireTtc: 100,
    });
    expect(r.depassementDansPlageHeures).toBe(0);
    expect(r.depassementHorsPlageHeures).toBe(2);
    expect(r.totalDepassementHeures).toBe(2);
    expect(r.montantTtc).toBe(200);
  });

  it("arrondit le depassement dans la plage a la demi-heure superieure", () => {
    // 10h->18h40 = 8h40 dans la plage, duree 8h -> 0h40 d'exces -> arrondi 1h.
    const r = calculerDepassementAg({
      assemblee: ag(10, 0, 18, 40),
      dureeAgContractuelleHeures: 8,
      ...PLAGE,
      tarifHoraireTtc: 100,
    });
    expect(r.depassementDansPlageHeures).toBe(1);
    expect(r.totalDepassementHeures).toBe(1);
  });

  it("comportement legacy : une AG commencee avant la plage ne facture que le hors-plage", () => {
    // 9h->20h : commence avant 10h -> cas 1/2 desactives ; seule l'heure 9h-10h
    // (hors plage) est facturee, malgre 10h reelles dans la plage (> 8h contractuel).
    const r = calculerDepassementAg({
      assemblee: ag(9, 0, 20, 0),
      dureeAgContractuelleHeures: 8,
      ...PLAGE,
      tarifHoraireTtc: 100,
    });
    expect(r.depassementDansPlageHeures).toBe(0);
    expect(r.depassementHorsPlageHeures).toBe(1);
    expect(r.totalDepassementHeures).toBe(1);
  });

  it("rejette un creneau invalide (fin avant debut)", () => {
    expect(() =>
      calculerDepassementAg({
        assemblee: ag(20, 0, 19, 0),
        dureeAgContractuelleHeures: 8,
        ...PLAGE,
        tarifHoraireTtc: 100,
      }),
    ).toThrow();
  });
});
