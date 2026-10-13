import { describe, expect, it } from "vitest";
import {
  factureComplete,
  fusionnerModele,
  objetCompose,
  objetFactureEstale,
  prefixeObjetCopro,
} from "./mes-emails-composition";

const copro = { reference: "S0247", nom: "Résidence Le Cyrano", adresse: "12 rue des Lilas 78400 Chatou" };

describe("objet auto-taggé copro", () => {
  it("met le code en tête (reconnu par le tri), puis le nom et l'adresse", () => {
    expect(prefixeObjetCopro(copro)).toBe("S0247 · Résidence Le Cyrano · 12 rue des Lilas 78400 Chatou");
  });

  it("tronque une adresse trop longue et peut l'omettre", () => {
    const longue = { reference: "S1", nom: "X", adresse: "a".repeat(80) };
    expect(prefixeObjetCopro(longue).endsWith("…")).toBe(true);
    expect(prefixeObjetCopro(copro, false)).toBe("S0247 · Résidence Le Cyrano");
  });

  it("colle le sujet saisi après le préfixe identifiant", () => {
    expect(objetCompose(copro, "Fuite dans le hall", false)).toBe("S0247 · Résidence Le Cyrano - Fuite dans le hall");
    expect(objetCompose(copro, "  ", false)).toBe("S0247 · Résidence Le Cyrano");
  });
});

describe("fusion de modèle", () => {
  it("remplace les variables connues, vide celles absentes, signale les inconnues", () => {
    const r = fusionnerModele("Bonjour {{destinataire_nom}}, copro {{copro_code}}{{copro_nom}}. {{truc}}", {
      destinataire_nom: "M. Dupont",
      copro_code: "S0247",
    });
    expect(r).toBe("Bonjour M. Dupont, copro S0247. [truc]");
  });
});

describe("facture ESTALE", () => {
  it("exige les trois champs", () => {
    expect(factureComplete({ compte: "601000", fournisseur: "DGP", libelle: "" })).toBe(false);
    expect(factureComplete({ compte: "601000", fournisseur: "DGP NETTOYAGE", libelle: "Entretien EV" })).toBe(true);
  });

  it("compose l'objet codifié, fournisseur en capitales", () => {
    expect(objetFactureEstale({ compte: "601000", fournisseur: "Dgp Nettoyage", libelle: "Entretien EV" })).toBe(
      "601000 - DGP NETTOYAGE - Entretien EV",
    );
  });
});
