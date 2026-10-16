import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegleRelance } from "@/lib/domain/contrats-copro";

// Les seuils de relance : bornes métier et écriture par le port.

const etat = vi.hoisted(() => ({ sauvees: [] as RegleRelance[] }));

vi.mock("@/lib/adapters/router", () => ({
  getContratsCoproRepository: () => ({
    listerReglesRelance: async () => ({
      assurance: { sujet: "assurance", premierRappelJours: 180, orangeJours: 30, rougeJours: 60, cadenceJours: 7 },
      gaz: { sujet: "gaz", premierRappelJours: 90, orangeJours: 30, rougeJours: 60, cadenceJours: 7 },
      ctq_ascenseur: { sujet: "ctq_ascenseur", premierRappelJours: 120, orangeJours: 30, rougeJours: 60, cadenceJours: 7 },
      ctq_vmc: { sujet: "ctq_vmc", premierRappelJours: 120, orangeJours: 30, rougeJours: 60, cadenceJours: 7 },
    }),
    sauverRegleRelance: async (r: RegleRelance) => {
      etat.sauvees.push(r);
    },
  }),
}));

import { listerRegles, modifierRegle, verifierRegle } from "./regles";

const AUTEUR = { id: "u1", nom: "Sekou KOMA", email: "sekou@real31.fr" };
const regle = (over: Partial<RegleRelance> = {}): RegleRelance => ({ sujet: "gaz", premierRappelJours: 90, orangeJours: 30, rougeJours: 60, cadenceJours: 7, ...over });

beforeEach(() => {
  etat.sauvees = [];
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("verifierRegle", () => {
  it("accepte les valeurs du seed", () => {
    expect(verifierRegle(regle())).toBeNull();
    expect(verifierRegle(regle({ premierRappelJours: 730, orangeJours: 365, rougeJours: 366, cadenceJours: 90 }))).toBeNull();
  });

  it("refuse hors bornes, non entier, rouge pas au-dessus de l'orange", () => {
    expect(verifierRegle(regle({ premierRappelJours: 0 }))).toMatch(/premier rappel/);
    expect(verifierRegle(regle({ premierRappelJours: 731 }))).toMatch(/premier rappel/);
    expect(verifierRegle(regle({ orangeJours: 366 }))).toMatch(/orange/);
    expect(verifierRegle(regle({ orangeJours: 7.5 }))).toMatch(/orange/);
    expect(verifierRegle(regle({ rougeJours: 30 }))).toBe("Le seuil rouge doit être strictement supérieur au seuil orange.");
    expect(verifierRegle(regle({ rougeJours: 731 }))).toMatch(/rouge/);
    expect(verifierRegle(regle({ cadenceJours: 0 }))).toMatch(/cadence/);
    expect(verifierRegle(regle({ cadenceJours: 91 }))).toMatch(/cadence/);
    expect(verifierRegle({ ...regle(), sujet: "chauffage" as never })).toBe("Sujet de suivi inconnu.");
  });
});

describe("modifierRegle", () => {
  it("écrit la règle par le port, sans champ parasite", async () => {
    await modifierRegle({ ...regle({ cadenceJours: 14 }), extra: "x" } as RegleRelance, AUTEUR);
    expect(etat.sauvees).toEqual([{ sujet: "gaz", premierRappelJours: 90, orangeJours: 30, rougeJours: 60, cadenceJours: 14 }]);
  });

  it("refuse une règle hors bornes sans rien écrire", async () => {
    await expect(modifierRegle(regle({ rougeJours: 10 }), AUTEUR)).rejects.toThrow(/rouge/);
    expect(etat.sauvees).toEqual([]);
  });

  it("listerRegles rend les 4 sujets", async () => {
    const r = await listerRegles();
    expect(Object.keys(r).sort()).toEqual(["assurance", "ctq_ascenseur", "ctq_vmc", "gaz"]);
  });
});
