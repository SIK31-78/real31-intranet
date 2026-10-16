// « L'assistante de la copro » (16/10/2026, REA-343 et REA-348) : le binôme de l'intranet
// d'abord, l'assistant de l'équipe de la copro ensuite, jamais d'erreur. Le routeur est
// MOCKÉ (aucune base) ; adresses inventées @example.test.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BinomesTri } from "@/lib/domain/tri-emails";

const etat = vi.hoisted(() => ({
  users: {} as Record<string, { id: string; nomComplet: string; initiales: string; email?: string }>,
  binomes: { binomes: [], parCopro: {} } as BinomesTri,
  panneBinomes: false,
}));

vi.mock("@/lib/adapters/router", () => ({
  getGestionnaireRepository: () => ({
    async findById(id: string) {
      return etat.users[id] ?? null;
    },
  }),
  getTriRepository: () => ({
    async binomes() {
      if (etat.panneBinomes) throw new Error("base indisponible");
      return etat.binomes;
    },
  }),
}));

import { assistanteDeCopro, copieAvecAssistante } from "./assistante-de-copro";

const GEST = { id: "u-g", nomComplet: "Gaëlle Gestion", initiales: "GG", email: "Gaelle@Example.test" };
const ASSIST_EQUIPE = { id: "u-a", nomComplet: "Alice Équipe", initiales: "AE", email: "alice@example.test" };
const JULIE = { nomComplet: "Julie Binôme", email: "Julie@Example.test" };
const PAUL = { nomComplet: "Paul Affecté", email: "paul@example.test" };

const copro = { code: "S297", nom: "LES TILLEULS", managerId: "u-g", assistantId: "u-a" };

beforeEach(() => {
  etat.users = { [GEST.id]: GEST, [ASSIST_EQUIPE.id]: ASSIST_EQUIPE };
  etat.binomes = {
    binomes: [
      { id: "b1", gestionnaireEmail: "gaelle@example.test", assistant: JULIE, principal: true },
      { id: "b2", gestionnaireEmail: "gaelle@example.test", assistant: PAUL, principal: false },
    ],
    parCopro: {},
  };
  etat.panneBinomes = false;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("assistanteDeCopro", () => {
  it("binôme principal du gestionnaire, prioritaire sur l'équipe", async () => {
    expect(await assistanteDeCopro(copro)).toEqual({ nomComplet: "Julie Binôme", email: "julie@example.test" });
  });

  it("affectation de la copro sous sa référence ESTALE (S0297 pour le code S297)", async () => {
    etat.binomes.parCopro = { S0297: "b2" };
    expect((await assistanteDeCopro(copro))?.email).toBe("paul@example.test");
  });

  it("pas de binôme pour ce gestionnaire : l'assistant de l'équipe", async () => {
    etat.binomes = { binomes: [], parCopro: {} };
    expect(await assistanteDeCopro(copro)).toEqual({ nomComplet: "Alice Équipe", email: "alice@example.test" });
  });

  it("binômes illisibles : repli sur l'équipe, sans erreur", async () => {
    etat.panneBinomes = true;
    expect((await assistanteDeCopro(copro))?.email).toBe("alice@example.test");
  });

  it("copro sans gestionnaire ni assistant connus : null", async () => {
    expect(await assistanteDeCopro({ code: "S1", nom: "X" })).toBeNull();
  });
});

describe("copieAvecAssistante", () => {
  const julie = { nomComplet: "Julie", email: "Julie@Example.test" };

  it("ajoute l'assistante en minuscules", () => {
    expect(copieAvecAssistante([], julie)).toEqual(["julie@example.test"]);
  });

  it("pas de doublon avec le « À », la boîte d'envoi ou la copie (sans casse)", () => {
    expect(copieAvecAssistante([], julie, ["JULIE@example.test"])).toEqual([]);
    expect(copieAvecAssistante(["julie@example.test"], julie)).toEqual(["julie@example.test"]);
    expect(copieAvecAssistante(["g@example.test"], julie, ["x@example.test"])).toEqual(["g@example.test", "julie@example.test"]);
  });

  it("aucune assistante : la copie telle quelle", () => {
    expect(copieAvecAssistante(["g@example.test"], null)).toEqual(["g@example.test"]);
  });
});
