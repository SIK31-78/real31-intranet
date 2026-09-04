// Tests du catalogue des points legaux de l'ODJ : ce qui est porte d'office, ce qui est
// retire d'office, et pourquoi. Le "pourquoi" compte autant que le booleen : la condition
// est AFFICHEE au gestionnaire, c'est elle qui lui dit s'il doit reintegrer le point.
//
// Regle verrouillee ici (demande des collegues, 2026-09-04) : une copro de moins de 10 ans
// est encore sous garantie decennale -> le PPT ne lui est pas porte. Ils le retiraient a la
// main a chaque ODJ de copro neuve.

import { describe, expect, it } from "vitest";
import { pointsLegaux, type PointLegal } from "./odj";

const point = (lots: number, opts: Parameters<typeof pointsLegaux>[1], id: string): PointLegal => {
  const p = pointsLegaux(lots, opts)?.find((x) => x.id === id);
  if (!p) throw new Error(`point ${id} absent du catalogue`);
  return p;
};

const ppt = (opts: Parameters<typeof pointsLegaux>[1]) => point(30, opts, "ppt");

describe("PPT et garantie decennale", () => {
  it("retire le PPT d'office pour un immeuble de moins de 10 ans", () => {
    const p = ppt({ anneeConstruction: 2020, anneeCourante: 2026 });
    expect(p.applicable).toBe(false);
    expect(p.condition).toMatch(/décennale/);
    expect(p.condition).toContain("2020");
  });

  it("retire encore le PPT la veille des 10 ans (9 ans revolus)", () => {
    expect(ppt({ anneeConstruction: 2017, anneeCourante: 2026 }).applicable).toBe(false);
  });

  it("ne parle plus de decennale a 10 ans pile - le point reste retire, mais parce qu'il a moins de 15 ans", () => {
    const p = ppt({ anneeConstruction: 2016, anneeCourante: 2026 });
    expect(p.applicable).toBe(false);
    expect(p.condition).not.toMatch(/décennale/);
    expect(p.condition).toMatch(/moins de 15 ans/);
  });

  it("porte le PPT des que l'immeuble depasse 15 ans", () => {
    const p = ppt({ anneeConstruction: 2000, anneeCourante: 2026 });
    expect(p.applicable).toBe(true);
    expect(p.condition).toMatch(/plus de 15 ans/);
  });

  it("garde le PPT quand l'annee de construction est inconnue (defaut prudent)", () => {
    expect(ppt(undefined).applicable).toBe(true);
    expect(ppt({ anneeCourante: 2026 }).applicable).toBe(true);
  });

  it("injecte l'echeance PPT correspondant au nombre de lots", () => {
    const vieux = { anneeConstruction: 1980, anneeCourante: 2026 };
    expect(point(250, vieux, "ppt").texte).toContain("1er janvier 2023");
    expect(point(80, vieux, "ppt").texte).toContain("1er janvier 2024");
    expect(point(20, vieux, "ppt").texte).toContain("1er janvier 2025");
  });
});

describe("catalogue des points legaux", () => {
  it("retire le fonds travaux ALUR d'office (proposition, pas obligation)", () => {
    expect(point(30, undefined, "fonds-travaux-alur").applicable).toBe(false);
  });

  it("ne porte pas le DPE collectif a un immeuble d'apres 2013", () => {
    expect(point(30, { anneeConstruction: 2018, anneeCourante: 2026 }, "dpe-collectif").applicable).toBe(false);
    expect(point(30, { anneeConstruction: 1995, anneeCourante: 2026 }, "dpe-collectif").applicable).toBe(true);
  });

  it("porte les points conditionnels par defaut, condition rappelee au gestionnaire", () => {
    for (const id of ["irve", "local-velo", "ag-hybride"]) {
      const p = point(30, undefined, id);
      expect(p.applicable).toBe(true);
      expect(p.condition).toBeTruthy();
    }
  });

  it("ecrit tous les textes en francais accentue (bug remonte par les collegues)", () => {
    // Filet anti-regression : aucun texte affiche ne doit revenir en ASCII sans accents.
    // "a compter", "propriete", "realise"... ont tous une forme accentuee dans le catalogue.
    for (const p of pointsLegaux(30, { anneeConstruction: 1990, anneeCourante: 2026 })) {
      expect(p.texte).not.toMatch(/\b(a compter|coproprietes?|realise|presente|declaree)\b/);
    }
  });
});
