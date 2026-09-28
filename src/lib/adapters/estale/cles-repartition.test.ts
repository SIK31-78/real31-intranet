// Lecture des cles de repartition Estale (condo.dks) pour le recap AG. Fonction pure :
// aucun appel reseau (le client est mocke par precaution).

import { describe, expect, it, vi } from "vitest";
import { clesActives } from "./estale-assemblee-provider";

vi.mock("./client", () => ({ estaleGql: vi.fn() }));

describe("clesActives (lecture de condo.dks)", () => {
  it("ecarte les cles archivees, met la cle par defaut en tete puis trie par code", () => {
    const cles = clesActives([
      { id: "c", name: "Ascenseur", code: "010", isDefault: false, archivedAt: null },
      { id: "x", name: "Ancienne", code: "002", isDefault: false, archivedAt: "2025-01-01T00:00:00Z" },
      { id: "b", name: "Bâtiment A", code: "003", isDefault: false, archivedAt: null },
      { id: "a", name: "Charges générales", code: "001", isDefault: true, archivedAt: null },
    ]);
    expect(cles.map((k) => k.nom)).toEqual(["Charges générales", "Bâtiment A", "Ascenseur"]);
    expect(cles[0]).toEqual({ id: "a", nom: "Charges générales", code: "001", parDefaut: true });
  });
});
