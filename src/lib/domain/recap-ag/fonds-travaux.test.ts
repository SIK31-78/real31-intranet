import { describe, it, expect } from "vitest";
import {
  avertissementFondsTravaux,
  libelleFondsTravaux,
  montantFondsTravaux,
  POURCENTAGE_FONDS_TRAVAUX_MINIMUM,
} from "./fonds-travaux";

describe("avertissementFondsTravaux", () => {
  it("n'avertit pas au minimum legal de 5 %", () => {
    expect(avertissementFondsTravaux({ pptVote: false, pourcentageBudget: 5 })).toBeNull();
  });

  it("n'avertit pas au-dessus du minimum", () => {
    expect(avertissementFondsTravaux({ pptVote: false, pourcentageBudget: 12.5 })).toBeNull();
  });

  it("avertit en dessous du minimum, sans bloquer", () => {
    const a = avertissementFondsTravaux({ pptVote: false, pourcentageBudget: 3 });
    expect(a).toContain("3 %");
    expect(a).toContain("minimum legal");
  });

  it("avertit aussi pour un pourcentage nul", () => {
    expect(avertissementFondsTravaux({ pptVote: false, pourcentageBudget: 0 })).not.toBeNull();
  });

  it("n'avertit pas si un PPT a ete vote (le fonds suit le plan)", () => {
    expect(avertissementFondsTravaux({ pptVote: true, pourcentageBudget: 2 })).toBeNull();
  });

  it("n'avertit pas si le pourcentage n'est pas renseigne", () => {
    expect(avertissementFondsTravaux({ pptVote: false })).toBeNull();
  });

  it("expose le minimum legal", () => {
    expect(POURCENTAGE_FONDS_TRAVAUX_MINIMUM).toBe(5);
  });
});

describe("libelleFondsTravaux (vue comptable du recap)", () => {
  const nbsp = (t: string) => t.replace(/ /g, " ");

  it("fusionne Oui/Non, pourcentage du budget et montant quand le budget vote est connu", () => {
    expect(nbsp(libelleFondsTravaux({ fondsTravaux: true, pourcentageBudget: 5, montantBudget: 25_000 }))).toBe(
      "Oui : 5 % du budget, soit 1 250,00 €",
    );
  });

  it("sans budget vote connu : le pourcentage seul", () => {
    expect(libelleFondsTravaux({ fondsTravaux: true, pourcentageBudget: 5.5 })).toBe("Oui : 5,5 % du budget");
  });

  it("pas de fonds travaux : Non, quel que soit le pourcentage", () => {
    expect(libelleFondsTravaux({ fondsTravaux: false, pourcentageBudget: 5 })).toBe("Non");
  });

  it("rien de saisi : non renseigne", () => {
    expect(libelleFondsTravaux({})).toBe("non renseigné");
  });

  it("montant arrondi au centime", () => {
    expect(montantFondsTravaux(12_345.67, 5)).toBe(617.28);
  });
});
