import { describe, it, expect } from "vitest";
import {
  factureValideeActive,
  messageEmissionFacture,
  modeEmissionFacture,
} from "./mode-emission";

describe("factureValideeActive", () => {
  it("active sur les valeurs explicites d'activation", () => {
    for (const v of ["oui", "OUI", " Oui ", "true", "1", "on", "yes"]) {
      expect(factureValideeActive(v), v).toBe(true);
    }
  });

  it("laisse le BROUILLON par defaut (variable absente ou vide)", () => {
    expect(factureValideeActive(undefined)).toBe(false);
    expect(factureValideeActive("")).toBe(false);
    expect(factureValideeActive("   ")).toBe(false);
  });

  it("laisse le BROUILLON sur une valeur non reconnue (faute de frappe comprise)", () => {
    // Le doute va toujours vers le reversible : une facture validee ne se defait pas.
    for (const v of ["non", "false", "0", "ou", "vrai", "valide"]) {
      expect(factureValideeActive(v), v).toBe(false);
    }
  });
});

describe("modeEmissionFacture", () => {
  it("sans jeton : inactif, quelle que soit l'option de validation", () => {
    expect(modeEmissionFacture(undefined, "oui")).toBe("inactif");
    expect(modeEmissionFacture("", "oui")).toBe("inactif");
  });

  it("avec jeton seul : brouillon (comportement historique)", () => {
    expect(modeEmissionFacture("cle", undefined)).toBe("brouillon");
    expect(modeEmissionFacture("cle", "non")).toBe("brouillon");
  });

  it("avec jeton + option : validee", () => {
    expect(modeEmissionFacture("cle", "oui")).toBe("validee");
  });
});

describe("messageEmissionFacture", () => {
  it("annonce l'irreversibilite quand la facture part validee", () => {
    const m = messageEmissionFacture("validee");
    expect(m).toContain("VALIDÉE");
    expect(m).toMatch(/plus être modifiée ni supprimée/);
  });

  it("annonce le brouillon a valider par la comptabilite", () => {
    expect(messageEmissionFacture("brouillon")).toMatch(/brouillon/i);
    expect(messageEmissionFacture("brouillon")).toMatch(/comptabilité/);
  });

  it("annonce la simulation quand aucun jeton n'est configure", () => {
    expect(messageEmissionFacture("inactif")).toMatch(/simulation/i);
  });
});
