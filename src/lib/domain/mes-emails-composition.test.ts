import { describe, expect, it } from "vitest";
import {
  adresseMailValide,
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

  it("garde l'adresse entière, même longue, et peut l'omettre", () => {
    // Cas réel S247 : l'objet partait avec « 78420 CARRIERES… ».
    const longue = { reference: "S0247", nom: "CYRANO", adresse: "16-18 Av Maréchal Juin / 56 r Gal Leclerc 78420 CARRIERES SUR SEINE" };
    expect(prefixeObjetCopro(longue)).toBe(`S0247 · CYRANO · ${longue.adresse}`);
    expect(prefixeObjetCopro(copro, false)).toBe("S0247 · Résidence Le Cyrano");
    // Le nom est l'adresse : on ne la répète pas (cas réel S0302).
    const peri = { reference: "S0302", nom: "44/50 rue Gabriel Péri", adresse: "44/50 Rue Gabriel Péri 78800 Houilles" };
    expect(prefixeObjetCopro(peri)).toBe("S0302 · 44/50 Rue Gabriel Péri 78800 Houilles");
    expect(prefixeObjetCopro(peri, false)).toBe("S0302 · 44/50 rue Gabriel Péri");
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

describe("adresse acceptée à l'envoi", () => {
  it("accepte les adresses courantes", () => {
    for (const e of ["mylene.pin@real31.fr", "contact@fidec-services.fr", "o'brien+copro@mail.co.uk"]) expect(adresseMailValide(e)).toBe(true);
  });
  it("refuse une adresse accentuée ou mal formée, comme le serveur", () => {
    for (const e of ["mylène.pin@real31.fr", "jean dupont@real31.fr", "a@b", ".a@real31.fr", "a..b@real31.fr"]) expect(adresseMailValide(e)).toBe(false);
  });
});
