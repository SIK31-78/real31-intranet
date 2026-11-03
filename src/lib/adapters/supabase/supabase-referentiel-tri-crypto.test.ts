import { describe, expect, it } from "vitest";
import { apportDuRegistre, nomsDesClients } from "./supabase-referentiel-tri-crypto";

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

describe("nomsDesClients (annuaire Crypto, 03/11/2026)", () => {
  it("copropriétaires et conseil syndical d'un côté, locataires de l'autre, jamais les professionnels", () => {
    const r = nomsDesClients([
      { reference: "S300", qualite: "coproprietaire", nom: "Dupont  Jean " },
      { reference: "S300", qualite: "conseil_syndical", nom: "Martin Paul" },
      { reference: "S300", qualite: "locataire", nom: "Petit Max" },
      { reference: "S300", qualite: "professionnel", nom: "Plomberie Durand" },
      { reference: "S300", qualite: "autre", nom: "Notaire X" },
      { reference: "S301", qualite: "locataire", nom: "Petit Max" },
    ]);
    expect(r.get("S300")).toEqual({ coproprietaires: ["Dupont Jean", "Martin Paul"], locataires: ["Petit Max"] });
    expect(r.get("S301")).toEqual({ locataires: ["Petit Max"] });
  });

  it("sans doublon ; un copropriétaire aussi locataire n'est que copropriétaire ; nom vide ignoré", () => {
    const r = nomsDesClients([
      { reference: "S300", qualite: "coproprietaire", nom: "Dupont Jean" },
      { reference: "S300", qualite: "conseil_syndical", nom: "DUPONT JEAN" },
      { reference: "S300", qualite: "locataire", nom: "dupont jean" },
      { reference: "S300", qualite: "locataire", nom: null },
      { reference: "S302", qualite: "professionnel", nom: "Plomberie Durand" },
    ]);
    expect(r.get("S300")).toEqual({ coproprietaires: ["Dupont Jean"] });
    expect(r.has("S302")).toBe(false);
  });
});
