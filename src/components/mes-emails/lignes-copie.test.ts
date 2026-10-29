import { describe, expect, it } from "vitest";
import { lignesCopieOuvertes, type LigneCopie } from "./lignes-copie";

describe("lignesCopieOuvertes", () => {
  it("laisse Cc et Cci repliés quand ils sont vides", () => {
    expect([...lignesCopieOuvertes(new Set(), { cc: 0, cci: 0 })]).toEqual([]);
  });

  it("ouvre d'elle-même une ligne qui a déjà un contenu (Répondre à tous, binôme en copie)", () => {
    expect([...lignesCopieOuvertes(new Set(), { cc: 2, cci: 0 })]).toEqual(["cc"]);
  });

  it("garde ouverte une ligne vidée après coup", () => {
    const ouvertes = new Set<LigneCopie>(["cc"]);
    expect(lignesCopieOuvertes(ouvertes, { cc: 0 }).has("cc")).toBe(true);
  });

  it("rend le même ensemble quand rien ne change", () => {
    const ouvertes = new Set<LigneCopie>(["cc"]);
    expect(lignesCopieOuvertes(ouvertes, { cc: 1, cci: 0 })).toBe(ouvertes);
  });
});
