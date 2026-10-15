import { describe, expect, it } from "vitest";
import { chercherCopros, cleRecherche, coproCorrespond } from "./recherche-copro-tolerante";

const stMartin = { reference: "S0109", nom: "STMARTIN", adresse: "12 rue Saint-Martin 95870 Bezons" };
const rosiers = { reference: "S0178", nom: "LESROSIERS", adresse: "125 rue Louise Michel 78500 Sartrouville" };

describe("recherche de copropriété tolérante", () => {
  it("« St Martin », « saint-martin » et « STMARTIN » se valent", () => {
    for (const q of ["St Martin", "saint-martin", "STMARTIN", "st-martin"]) expect(coproCorrespond(stMartin, q)).toBe(true);
    expect(cleRecherche("Sainte-Anne")).toBe("stanne");
  });

  it("trouve par la ville et par le code, avec ou sans zéros", () => {
    expect(chercherCopros([rosiers, stMartin], "bezons").map((c) => c.reference)).toEqual(["S0109"]);
    expect(coproCorrespond(stMartin, "S109")).toBe(true);
    expect(coproCorrespond(stMartin, "109")).toBe(true);
    expect(coproCorrespond(rosiers, "S109")).toBe(false);
  });

  it("une recherche vide ne propose rien", () => {
    expect(chercherCopros([stMartin], "  ")).toEqual([]);
  });
});
