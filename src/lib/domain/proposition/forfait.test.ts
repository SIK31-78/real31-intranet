import { describe, expect, it } from "vitest";
import { calculerForfait, ecartGrille, type GrilleForfait } from "./forfait";
import { informationsManquantes, origineDepuisLibelle, statutDepuisLibelle } from "./proposition";

// La grille 2026 du cabinet (« TARIFS tous services 2026 », onglet syndic).
const GRILLE_2026: GrilleForfait = {
  base: 2899,
  parLot: 202,
  chauffageCollectif: 630,
  gardien: 786,
  parAscenseur: 158,
  parPorteGarage: 113,
  timbresParCoproprietaire: 21.7,
};

describe("calculerForfait", () => {
  it("immeuble simple : base + lots", () => {
    const f = calculerForfait({ lotsPrincipaux: 22 }, GRILLE_2026);
    expect(f.grilleTtc).toBe(2899 + 202 * 22);
    expect(f.timbresTtc).toBeCloseTo(21.7 * 22, 2);
    expect(f.details.map((d) => d.ligne)).toEqual(["base", "parLot", "timbresParCoproprietaire"]);
  });

  it("supplements : chauffage, gardien, ascenseurs, portes", () => {
    const f = calculerForfait({ lotsPrincipaux: 46, chauffageCollectif: true, gardien: true, ascenseurs: 2, portesGarage: 1 }, GRILLE_2026);
    expect(f.grilleTtc).toBe(2899 + 202 * 46 + 630 + 786 + 158 * 2 + 113);
    expect(f.grilleHt).toBeCloseTo(f.grilleTtc / 1.2, 2);
  });

  it("les timbres suivent les coproprietaires quand on les connait, sinon les lots", () => {
    expect(calculerForfait({ lotsPrincipaux: 10, coproprietaires: 8 }, GRILLE_2026).timbresTtc).toBeCloseTo(173.6, 2);
    expect(calculerForfait({ lotsPrincipaux: 10 }, GRILLE_2026).timbresTtc).toBeCloseTo(217, 2);
  });

  it("une ligne absente de la grille vaut 0 et n'apparait pas", () => {
    const f = calculerForfait({ lotsPrincipaux: 5, gardien: true }, { base: 2899, parLot: 202 });
    expect(f.grilleTtc).toBe(2899 + 1010);
    expect(f.details.find((d) => d.ligne === "gardien")?.montantTtc).toBe(0);
  });

  it("ecart en pourcentage, null sans grille", () => {
    expect(ecartGrille(9000, 10000)).toBe(-10);
    expect(ecartGrille(11000, 10000)).toBe(10);
    expect(ecartGrille(500, 0)).toBeNull();
  });
});

describe("normalisation de l'Excel", () => {
  it("statuts, quelle que soit la casse", () => {
    expect(statutDepuisLibelle("Refusé par REAL 31 ")).toBe("refuse_real31");
    expect(statutDepuisLibelle("refusé par l'ag")).toBe("refuse_ag");
    expect(statutDepuisLibelle("Refusé par le Cs")).toBe("refuse_cs");
    expect(statutDepuisLibelle("Refusé")).toBe("refuse_cs");
    expect(statutDepuisLibelle("elu")).toBe("elu");
    expect(statutDepuisLibelle("Accepté par le CS")).toBe("accepte_cs");
    expect(statutDepuisLibelle("en cours")).toBe("en_cours");
    expect(statutDepuisLibelle("Reporté")).toBe("reporte");
    expect(statutDepuisLibelle("Autre")).toBeNull();
  });

  it("origines", () => {
    expect(origineDepuisLibelle("Bouche à Oreille")).toBe("bouche_a_oreille");
    expect(origineDepuisLibelle("Vitrine/pub")).toBe("vitrine");
    expect(origineDepuisLibelle("Déjà Client")).toBe("deja_client");
    expect(origineDepuisLibelle("NC")).toBeUndefined();
  });

  it("la saisie rapide dit ce qu'il manque pour faire une offre", () => {
    expect(informationsManquantes({ immeuble: { adresse: "1 rue X" }, contact: { nom: "Mme Y", telephone: "06" } })).toEqual([
      "le nombre de lots principaux",
      "le syndic actuel",
      "la date de la prochaine AG",
      "la date de clôture comptable",
    ]);
  });
});
