import { beforeEach, describe, expect, it } from "vitest";
// eslint-disable-next-line boundaries/element-types
import { mockBiens } from "@/lib/adapters/mock/mock-bien-repository";
import type { BienHorsSyndic } from "@/lib/domain/bien";
import type { Acteur } from "./contexte";
import { BienDesactiveError, creerBien, reactiverBien } from "./biens";

const acteur: Acteur = { id: "u1", nom: "Test", agence: "ASN", direction: [] };
const saisie = {
  activite: "location" as const,
  reference: "TRILLOT-18",
  type: "appartement" as const,
  proprietaire: { nom: "Nouveau" },
};

function ancien(actif: boolean): BienHorsSyndic {
  return {
    id: "b1",
    agenceCode: "ASN",
    activite: "location",
    reference: "TRILLOT-18",
    type: "appartement",
    libelle: "",
    adresse: {},
    proprietaire: { nom: "Ancien" },
    actif,
    source: "intranet",
  };
}

describe("creerBien : référence prise par un bien désactivé (REA-53)", () => {
  beforeEach(() => {
    mockBiens().biens = [];
  });

  it("n'écrit rien et signale le bien désactivé, avec son ancien propriétaire", async () => {
    mockBiens().biens = [ancien(false)];
    const err = await creerBien(saisie, acteur).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BienDesactiveError);
    expect((err as BienDesactiveError).bien).toMatchObject({ id: "b1", nom: "Ancien" });
    expect(mockBiens().biens).toHaveLength(1);
    expect(mockBiens().biens[0]).toMatchObject({ actif: false, proprietaire: { nom: "Ancien" } });
  });

  it("garde le message habituel pour une référence prise par un bien actif", async () => {
    mockBiens().biens = [ancien(true)];
    await expect(creerBien(saisie, acteur)).rejects.toThrow(/choisis ce bien dans la liste/);
  });
});

describe("reactiverBien", () => {
  beforeEach(() => {
    mockBiens().biens = [ancien(false)];
  });

  it("remet en service sans toucher au propriétaire", async () => {
    const r = await reactiverBien("b1", acteur);
    expect(r.id).toBe("b1");
    expect(mockBiens().biens[0]).toMatchObject({ actif: true, proprietaire: { nom: "Ancien" } });
  });

  it("refuse un acteur d'une autre agence", async () => {
    await expect(reactiverBien("b1", { ...acteur, agence: "ML" })).rejects.toThrow();
    expect(mockBiens().biens[0]?.actif).toBe(false);
  });
});
