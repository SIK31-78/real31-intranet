import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({ impl: async (): Promise<unknown> => [] }));

vi.mock("@/lib/adapters/router", () => ({
  getAssembleeEstaleProvider: () => ({ listerClesRepartition: () => etat.impl() }),
}));
vi.mock("@/lib/services/coproprietes/exiger-perimetre", () => ({ exigerPerimetre: async () => {} }));

import { listerClesRepartition } from "./cles-repartition";

beforeEach(() => {
  etat.impl = async () => [];
});

describe("cles de repartition proposees au recap AG", () => {
  it("rend la liste du provider", async () => {
    etat.impl = async () => [{ id: "k1", nom: "Charges générales", code: "001", parDefaut: true }];
    expect(await listerClesRepartition("S002", "m1")).toHaveLength(1);
  });

  it("ESTALE qui tombe : liste vide, jamais d'erreur (la saisie libre reste possible)", async () => {
    etat.impl = async () => {
      throw new Error("fetch failed");
    };
    expect(await listerClesRepartition("S002", "m1")).toEqual([]);
  });
});
