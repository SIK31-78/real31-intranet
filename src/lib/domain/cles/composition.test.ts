import { describe, expect, it } from "vitest";
import { euros, texteComposition, valeurComposition } from "./composition";

describe("valeur des clés (REA-53)", () => {
  it("additionne quantité × valeur unitaire des éléments valorisés", () => {
    expect(valeurComposition([{ type: "cle", libelle: "", quantite: 3, valeurUnitaire: 15 }, { type: "badge", libelle: "Vigik", quantite: 1, valeurUnitaire: 25.5 }])).toBe(70.5);
  });

  it("ignore un élément sans valeur, et rend null si aucun n'en a", () => {
    expect(valeurComposition([{ type: "cle", libelle: "", quantite: 2, valeurUnitaire: 10 }, { type: "bip", libelle: "", quantite: 1 }])).toBe(20);
    expect(valeurComposition([{ type: "cle", libelle: "", quantite: 2 }])).toBeNull();
  });

  it("écrit la composition, avec la valeur quand on la demande", () => {
    const c = [{ type: "cle" as const, libelle: "haute sécurité", quantite: 2, valeurUnitaire: 60 }, { type: "badge" as const, libelle: "", quantite: 1 }];
    expect(texteComposition(c)).toBe("2 clés (haute sécurité), 1 badge");
    expect(texteComposition(c, true)).toBe("2 clés (haute sécurité) à 60 €, 1 badge");
  });

  it("formate les euros à la française", () => {
    expect(euros(1250).replace(/\s/g, " ")).toBe("1 250 €");
    expect(euros(12.5)).toBe("12,50 €");
  });
});
