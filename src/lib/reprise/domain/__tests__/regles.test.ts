import { describe, expect, it } from "vitest";
import {
  estCiviliteValide,
  estCodeCleValide,
  estMajuscules,
  estTitleCase,
  estUsageValide,
  formaterCodeCle,
  toNomMajuscules,
  toTitleCase,
} from "../regles";

describe("listes fermees", () => {
  it("usage : accepte la liste fermee, rejette le reste", () => {
    expect(estUsageValide("residential")).toBe(true);
    expect(estUsageValide("parking")).toBe(true);
    expect(estUsageValide("habitation")).toBe(false);
    expect(estUsageValide("")).toBe(false);
  });

  it("civilite : accepte la liste fermee stricte, rejette 'autre' et 'M.'", () => {
    expect(estCiviliteValide("m&mme")).toBe(true);
    expect(estCiviliteValide("indivision")).toBe(true);
    expect(estCiviliteValide("autre")).toBe(false);
    expect(estCiviliteValide("M.")).toBe(false);
    expect(estCiviliteValide("Mme")).toBe(false);
  });
});

describe("toTitleCase (R6)", () => {
  it("normalise majuscules et minuscules", () => {
    expect(toTitleCase("JEAN")).toBe("Jean");
    expect(toTitleCase("jean")).toBe("Jean");
  });
  it("preserve et capitalise apres tiret et apostrophe", () => {
    expect(toTitleCase("JEAN-PIERRE")).toBe("Jean-Pierre");
    expect(toTitleCase("marie d'arc")).toBe("Marie D'Arc");
  });
  it("gere les couples 'Prenom Mr & Prenom Mme'", () => {
    expect(toTitleCase("jean & marie")).toBe("Jean & Marie");
  });
});

describe("estTitleCase / estMajuscules", () => {
  it("valide un prenom Title Case", () => {
    expect(estTitleCase("Jean-Pierre")).toBe(true);
    expect(estTitleCase("Jean Marie")).toBe(true);
    expect(estTitleCase("JEAN")).toBe(false);
    expect(estTitleCase("jean")).toBe(false);
    expect(estTitleCase("")).toBe(false);
  });
  it("valide un nom en majuscules", () => {
    expect(estMajuscules("DUPONT")).toBe(true);
    expect(estMajuscules("Dupont")).toBe(false);
    expect(estMajuscules("")).toBe(false);
    expect(toNomMajuscules("Dupont")).toBe("DUPONT");
  });
});

describe("codes cles", () => {
  it("prefixe sur 3 chiffres", () => {
    expect(formaterCodeCle("1")).toBe("001");
    expect(formaterCodeCle("100")).toBe("100");
    expect(formaterCodeCle("210")).toBe("210");
    expect(formaterCodeCle("12345")).toBe("12345");
  });
  it("valide un code prefixe, rejette un code court ou non numerique", () => {
    expect(estCodeCleValide("001")).toBe(true);
    expect(estCodeCleValide("1")).toBe(false);
    expect(estCodeCleValide("A1")).toBe(false);
  });
});
