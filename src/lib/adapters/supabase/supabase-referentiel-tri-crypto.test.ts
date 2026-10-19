import { describe, expect, it } from "vitest";
import { apportDuRegistre } from "./supabase-referentiel-tri-crypto";

const ligne = (p: Partial<Parameters<typeof apportDuRegistre>[0]>) => ({
  immatriculation: "ZZ1234567",
  nom_usage: null,
  adresse: null,
  adresses_compl: null,
  code_postal: "92999",
  commune: "Montvalon",
  ...p,
});

describe("apportDuRegistre", () => {
  it("ajoute le nom d'usage, l'adresse de référence et les adresses complémentaires", () => {
    const r = apportDuRegistre(
      ligne({ nom_usage: "LE CLOS FLEURI", adresse: "81 Boulevard Imaginaire", adresses_compl: ["2 Avenue des Platanes 92999 Montvalon", "4 rue Basse"] }),
      { nom: "LECLOS_XYZ", adresse: "1 rue Haute 92999 Montvalon" },
    );
    expect(r).toEqual({
      nomsUsage: ["LE CLOS FLEURI"],
      adressesSecondaires: ["81 Boulevard Imaginaire 92999 Montvalon", "2 Avenue des Platanes 92999 Montvalon", "4 rue Basse 92999 Montvalon"],
    });
  });

  it("ne répète ni l'adresse déjà connue ni un nom identique au nom Crypto", () => {
    const r = apportDuRegistre(ligne({ nom_usage: "Les Tilleuls", adresse: "1 rue Haute" }), { nom: "LES TILLEULS", adresse: "1 rue Haute 92999 Montvalon" });
    expect(r).toEqual({});
  });
});
