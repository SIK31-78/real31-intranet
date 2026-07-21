import { describe, it, expect } from "vitest";
import { avertissementFondsTravaux, POURCENTAGE_FONDS_TRAVAUX_MINIMUM } from "./fonds-travaux";

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
