import { describe, expect, it } from "vitest";
import { raisonExerciceFerme, totalConcorde, ventilerPourEstale } from "./ventilation-estale";
import { CATEGORIE_FORFAIT_POSTAUX, CATEGORIE_GESTION_COURANTE } from "./produits";

describe("ventilerPourEstale", () => {
  it("met les honoraires en 6211 (TVA 20 %) et les timbres en 6213 (sans TVA)", () => {
    const lignes = ventilerPourEstale([
      { categorieProduit: CATEGORIE_GESTION_COURANTE, quantite: 1, prixUnitaireHt: 1000, tauxTva: 0.2 },
      { categorieProduit: CATEGORIE_FORFAIT_POSTAUX, quantite: 1, prixUnitaireHt: 45.5, tauxTva: 0 },
    ]);
    expect(lignes).toEqual([
      { compte: "6211", libelle: "Honoraires de gestion courante", montantTtc: 1200, tva: 200 },
      { compte: "6213", libelle: "Forfait de frais postaux", montantTtc: 45.5, tva: 0 },
    ]);
  });

  it("regroupe les segments d'un trimestre a cheval sur deux tarifs", () => {
    const lignes = ventilerPourEstale([
      { categorieProduit: CATEGORIE_GESTION_COURANTE, quantite: 1, prixUnitaireHt: 333.33, tauxTva: 0.2 },
      { categorieProduit: CATEGORIE_GESTION_COURANTE, quantite: 1, prixUnitaireHt: 666.67, tauxTva: 0.2 },
    ]);
    expect(lignes).toEqual([{ compte: "6211", libelle: "Honoraires de gestion courante", montantTtc: 1200, tva: 200 }]);
  });

  it("refuse une ligne sans compte ESTALE plutot que d'imputer au hasard", () => {
    expect(() =>
      ventilerPourEstale([{ categorieProduit: "Etat date", quantite: 1, prixUnitaireHt: 300, tauxTva: 0.2 }]),
    ).toThrow(/aucun compte ESTALE/);
    expect(() => ventilerPourEstale([{ categorieProduit: null, quantite: 1, prixUnitaireHt: 300, tauxTva: 0.2 }])).toThrow(
      /sans catégorie/,
    );
  });
});

describe("totalConcorde", () => {
  const lignes = [
    { compte: "6211", libelle: "", montantTtc: 1200, tva: 200 },
    { compte: "6213", libelle: "", montantTtc: 45.5, tva: 0 },
  ];
  it("accepte le meme total au centime", () => expect(totalConcorde(lignes, 1245.5)).toBe(true));
  it("refuse un centime d'ecart", () => expect(totalConcorde(lignes, 1245.51)).toBe(false));
});

describe("raisonExerciceFerme", () => {
  const exercices = [
    { periode: "2026-07-01,2027-06-30", verrouille: false, clos: false },
    { periode: "2025-07-01,2026-06-30", verrouille: true, clos: false },
    { periode: "2024-07-01,2025-06-30", verrouille: true, clos: true },
  ];
  it("laisse passer une date dans un exercice ouvert, bornes comprises", () => {
    expect(raisonExerciceFerme("2026-07-01", exercices)).toBeNull();
    expect(raisonExerciceFerme("2027-06-30", exercices)).toBeNull();
  });
  it("dit verrouille, clos, ou sans exercice", () => {
    expect(raisonExerciceFerme("2026-03-31", exercices)).toMatch(/verrouillé/);
    expect(raisonExerciceFerme("2025-01-15", exercices)).toMatch(/clos/);
    expect(raisonExerciceFerme("2027-09-30", exercices)).toMatch(/Aucun exercice/);
  });
  it("comprend une borne de fin exclue au format [debut,fin)", () => {
    const ex = [{ periode: "[2026-01-01,2027-01-01)", verrouille: false, clos: false }];
    expect(raisonExerciceFerme("2026-12-31", ex)).toBeNull();
    expect(raisonExerciceFerme("2027-01-01", ex)).toMatch(/Aucun exercice/);
  });
});
