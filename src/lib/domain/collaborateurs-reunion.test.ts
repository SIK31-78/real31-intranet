// Tests de la validation PURE des collaborateurs associes a une reunion (anti-injection).
// Aucun reseau, aucun mock : que la logique de filtrage contre la liste fermee.

import { describe, expect, it } from "vitest";
import { validerCollaborateursConnus } from "./collaborateurs-reunion";

const CONNUS = ["e.lambert@real31.fr", "f.amrani@real31.fr", "d.petit@real31.fr"];
const MOI = "e.lambert@real31.fr";

describe("validerCollaborateursConnus", () => {
  it("garde les emails connus, en casse canonique, sans l'organisateur", () => {
    const r = validerCollaborateursConnus(["F.Amrani@REAL31.fr", MOI], CONNUS, MOI);
    // MOI (organisateur) exclu ; f.amrani ramene a la casse de la liste connue.
    expect(r).toEqual({ emails: ["f.amrani@real31.fr"] });
  });

  it("rejette tout le lot si un email est inconnu (anti-injection)", () => {
    const r = validerCollaborateursConnus(
      ["f.amrani@real31.fr", "intrus@ailleurs.com"],
      CONNUS,
      MOI,
    );
    expect(r).toEqual({ invalide: true });
  });

  it("dedoublonne (insensible a la casse) et ignore les entrees vides", () => {
    const r = validerCollaborateursConnus(
      ["", "  ", "f.amrani@real31.fr", "F.AMRANI@real31.fr", "d.petit@real31.fr"],
      CONNUS,
      MOI,
    );
    expect(r).toEqual({ emails: ["f.amrani@real31.fr", "d.petit@real31.fr"] });
  });

  it("liste vide -> aucun collaborateur (jamais invalide)", () => {
    expect(validerCollaborateursConnus([], CONNUS, MOI)).toEqual({ emails: [] });
  });

  it("seulement l'organisateur demande -> liste vide (il ne s'invite pas)", () => {
    expect(validerCollaborateursConnus([MOI], CONNUS, MOI)).toEqual({ emails: [] });
  });
});
