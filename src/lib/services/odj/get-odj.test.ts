// Composition de l'ODJ (get-odj) : ce que la fiche copro sait doit arriver dans l'ODJ.
// Toutes les sources sont simulees : aucune base, aucun appel ESTALE.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Odj } from "@/lib/domain/odj";

const etat = vi.hoisted(() => ({
  copro: {} as Record<string, unknown>,
}));

vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () => ({
    async findByCode() {
      return etat.copro;
    },
  }),
  getOdjRepository: () => ({
    async getEtat() {
      return [];
    },
  }),
}));
vi.mock("@/lib/services/estale/donnees-copro-estale", () => ({
  donneesCoproEstale: async () => null,
}));
vi.mock("@/lib/services/coproprietes/confirmation-evenement", () => ({
  getConfirmations: async () => [],
}));
vi.mock("@/lib/services/agences/resoudre-agence", () => ({
  codeAgence: async () => undefined,
}));

import { getOdj } from "./get-odj";

function copro(extra: Record<string, unknown> = {}) {
  return {
    code: "S146",
    nom: "Les Marronniers",
    adresse: { ligne1: "12 rue des Lilas", codePostal: "92250", ville: "La Garenne-Colombes" },
    lotsPrincipaux: 20,
    equipe: [],
    prochaineAg: { date: "2026-11-16" },
    ...extra,
  };
}

function enTete(odj: Odj | null, id: string) {
  return odj?.enTete.find((c) => c.id === id);
}

describe("getOdj - date du CS", () => {
  beforeEach(() => {
    etat.copro = copro();
  });

  it("porte l'heure du CS quand la fiche copro la connait (REA-143)", async () => {
    etat.copro = copro({ prochaineCsDate: "2026-10-05", prochaineCsHeure: "18:30" });
    const odj = await getOdj("S146", "g1");
    expect(enTete(odj, "date-cs")?.valeur).toBe("05/10/2026 à 18h30");
  });

  it("garde la date seule pour un CS sans heure (journee entiere)", async () => {
    etat.copro = copro({ prochaineCsDate: "2026-10-05" });
    const odj = await getOdj("S146", "g1");
    expect(enTete(odj, "date-cs")?.valeur).toBe("05/10/2026");
  });
});
