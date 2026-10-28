// Copie au binôme d'un envoi au conseil syndical (28/10/2026). Adresses inventées @example.test.

import { describe, expect, it } from "vitest";
import { conseilEncoreDestinataire, copieBinomeConseil, phraseCopieBinome } from "./copie-binome";

const G = { nomComplet: "Gaëlle Gestion", email: "Gaelle@Example.test" };
const A = { nomComplet: "Julie Binôme", email: "julie@example.test" };
const g = { nomComplet: G.nomComplet, email: "gaelle@example.test" };

describe("copieBinomeConseil", () => {
  it("le gestionnaire envoie : l'assistante en copie", () => {
    expect(copieBinomeConseil({ envoyeur: "GAELLE@example.test", gestionnaire: G, assistante: A })).toEqual([A]);
  });

  it("l'assistante envoie : le gestionnaire en copie (adresse en minuscules)", () => {
    expect(copieBinomeConseil({ envoyeur: " Julie@Example.test ", gestionnaire: G, assistante: A })).toEqual([g]);
  });

  it("ni l'un ni l'autre (remplaçant, admin) : les deux, retirables", () => {
    expect(copieBinomeConseil({ envoyeur: "autre@example.test", gestionnaire: G, assistante: A })).toEqual([g, A]);
    expect(copieBinomeConseil({ envoyeur: null, gestionnaire: G, assistante: A })).toEqual([g, A]);
  });

  it("copro sans assistante, ou sans gestionnaire connu : personne", () => {
    expect(copieBinomeConseil({ envoyeur: "autre@example.test", gestionnaire: G, assistante: null })).toEqual([]);
    expect(copieBinomeConseil({ envoyeur: "julie@example.test", gestionnaire: null, assistante: A })).toEqual([]);
    expect(copieBinomeConseil({ envoyeur: "x@example.test", gestionnaire: G, assistante: { nomComplet: "Sans", email: " " } })).toEqual([]);
  });

  it("gestionnaire et assistante à la même adresse : pas de binôme, personne", () => {
    expect(copieBinomeConseil({ envoyeur: "x@example.test", gestionnaire: G, assistante: { ...A, email: "gaelle@example.test" } })).toEqual([]);
  });

  it("pas de doublon avec une adresse déjà destinataire", () => {
    expect(copieBinomeConseil({ envoyeur: "gaelle@example.test", gestionnaire: G, assistante: A, dejaDestinataires: ["JULIE@example.test"] })).toEqual([]);
    expect(copieBinomeConseil({ envoyeur: "x@example.test", gestionnaire: G, assistante: A, dejaDestinataires: ["julie@example.test"] })).toEqual([g]);
  });
});

describe("conseilEncoreDestinataire", () => {
  it("vrai tant qu'une adresse du CS reste en « À »", () => {
    expect(conseilEncoreDestinataire(["Pres@Exemple.fr", "x@y.fr"], ["pres@exemple.fr", "m@exemple.fr"])).toBe(true);
    expect(conseilEncoreDestinataire(["x@y.fr"], ["pres@exemple.fr"])).toBe(false);
    expect(conseilEncoreDestinataire([], [])).toBe(false);
  });
});

describe("phraseCopieBinome", () => {
  it("dit qui est en copie, au singulier ou au pluriel", () => {
    expect(phraseCopieBinome([])).toBe("");
    expect(phraseCopieBinome(["Julie Binôme"])).toBe("Julie Binôme, du binôme de la copro, est en copie. Retirez l'adresse si besoin.");
    expect(phraseCopieBinome(["Gaëlle Gestion", "Julie Binôme"])).toBe(
      "Gaëlle Gestion et Julie Binôme, du binôme de la copro, sont en copie. Retirez une adresse si besoin.",
    );
  });
});
