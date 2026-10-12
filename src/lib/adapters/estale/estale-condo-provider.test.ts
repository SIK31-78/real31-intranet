// Roles de l'equipe deduits des intitules libres d'ESTALE (REA-33) : seuls les assistants
// de copropriete entrent dans l'equipe, pas l'assistante commerciale.

import { describe, expect, it } from "vitest";
import { equipeDepuisEstale } from "./estale-condo-provider";

const collab = (id: string, fullname: string, role: string | null) => ({ id, fullname, role });

describe("equipeDepuisEstale - intitules reels", () => {
  it("« Assistant de copropriété » : assistant", () => {
    const equipe = equipeDepuisEstale([collab("1", "Elsa Martin", "Assistant de copropriété")], null);
    expect(equipe.map((m) => m.role)).toEqual(["assistant"]);
  });

  it("« Assistante de gestion » : assistant", () => {
    const equipe = equipeDepuisEstale([collab("1", "Elsa Martin", "Assistante de gestion")], null);
    expect(equipe.map((m) => m.role)).toEqual(["assistant"]);
  });

  it("« Assistante commerciale » : ecartee de l'equipe de la copro", () => {
    const equipe = equipeDepuisEstale([collab("1", "Lina Roux", "Assistante commerciale")], null);
    expect(equipe).toEqual([]);
  });

  it("« Assistant comptable » : reste comptable", () => {
    const equipe = equipeDepuisEstale([collab("1", "Paul Durand", "Assistant comptable")], null);
    expect(equipe.map((m) => m.role)).toEqual(["comptable"]);
  });

  it("le gestionnaire du mandat prime sur l'intitule, puis l'ordre gestionnaire/comptable/assistant", () => {
    const equipe = equipeDepuisEstale(
      [
        collab("a", "Elsa Martin", "Assistante de copropriété"),
        collab("c", "Lina Roux", "Assistante commerciale"),
        collab("g", "Océane Bernard", "Assistante de copropriété"),
        collab("k", "Paul Durand", "Comptable"),
      ],
      "g",
    );
    expect(equipe.map((m) => [m.nomComplet, m.role])).toEqual([
      ["Océane Bernard", "gestionnaire"],
      ["Paul Durand", "comptable"],
      ["Elsa Martin", "assistant"],
    ]);
  });
});
