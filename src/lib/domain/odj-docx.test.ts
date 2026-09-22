import { describe, expect, it } from "vitest";
import type { Odj } from "./odj";
import { bornesContrat, donneesDocxOdjCs, heureFrancaise } from "./odj-docx";

function odjMinimal(surcharges: Partial<Odj> = {}): Odj {
  return {
    copro: { code: "SE999", nom: "Test", adresse: "31 rue de l'Estale, 92250 La Garenne-Colombes" },
    dateAg: "19/11/2026",
    dateAgISO: "2026-11-19",
    enTete: [
      { id: "date-cs", libelle: "Date du CS", source: "supabase", valeur: "05/10/2026" },
      { id: "date-ag", libelle: "Date de l'AG", source: "supabase", valeur: "19/11/2026" },
      { id: "lieu", libelle: "Lieu", source: "supabase", valeur: "Salle des fêtes" },
      { id: "visio", libelle: "Visio", source: "estale", type: "booleen", valeur: "oui" },
      { id: "presents-syndic", libelle: "Syndic", source: "supabase", valeur: "KOMA Sekou, DUPONT Anne" },
      { id: "limite-odj", libelle: "Limite", source: "jalon", valeur: "09/10/2026" },
      { id: "mise-sous-pli", libelle: "Pli", source: "jalon", valeur: "19/10/2026" },
    ],
    sections: [
      {
        id: "verif-comptes",
        titre: "Vérification des comptes",
        champs: [
          { id: "comptes.depenses-courantes", libelle: "Dépenses", source: "estale", type: "montant", valeur: "41200" },
          { id: "comptes.budget", libelle: "Budget", source: "estale", type: "montant", valeur: "45000" },
          { id: "comptes.debiteurs", libelle: "Débiteurs", source: "estale", valeur: "MARTIN 1 200,00 €" },
          { id: "comptes.fonds-travaux", libelle: "Fonds", source: "estale", type: "montant", valeur: "8000" },
        ],
      },
      {
        id: "gestion-courante",
        titre: "Gestion courante",
        champs: [
          { id: "gestion.gaz", libelle: "Gaz", source: "estale", valeur: "Gaz de Paris (du 01/01/2025 au 31/12/2026)" },
          { id: "gestion.electricite", libelle: "Élec", source: "estale", valeur: "EDF (depuis le 01/03/2024)" },
        ],
      },
      {
        id: "points-a-porter",
        titre: "Points",
        champs: [
          { id: "points.budget-n1", libelle: "Budget N+1", source: "estale", type: "montant", valeur: "46500" },
          { id: "points.renouvellement-cs", libelle: "CS", source: "estale", valeur: "DURAND Paul (président), LEROY Marie" },
        ],
      },
    ],
    pointsLegaux: [
      { id: "ppt", titre: "PPT", texte: "", applicable: true },
      { id: "dpe-collectif", titre: "DPE", texte: "", applicable: false },
      { id: "irve", titre: "IRVE", texte: "", applicable: true },
      { id: "local-velo", titre: "Vélo", texte: "", applicable: false },
      { id: "ag-hybride", titre: "Hybride", texte: "", applicable: true },
      { id: "location-touristique", titre: "Le Meur", texte: "", applicable: true },
    ],
    ...surcharges,
  };
}

describe("donneesDocxOdjCs", () => {
  it("projette les champs de l'ODJ sur les balises du gabarit, valeurs formatées", () => {
    const d = donneesDocxOdjCs(odjMinimal(), { heureCs: "18:30", heureAg: "19:00" });
    expect(d.adresse).toBe("31 rue de l'Estale, 92250 La Garenne-Colombes");
    expect(d.dateCs).toBe("05/10/2026");
    expect(d.heureCs).toBe("18h30");
    expect(d.heureAg).toBe("19h00");
    expect(d.equipeSyndic).toBe("KOMA Sekou, DUPONT Anne");
    expect(d.lieuAg).toBe("Salle des fêtes");
    expect(d.modeAg).toBe("hybride (présentiel et visio)");
    expect(d.depenses).toBe("41 200,00 €");
    expect(d.budget).toBe("45 000,00 €");
    expect(d.membresCs).toBe("DURAND Paul (président), LEROY Marie");
  });

  it("l'écart budget prend la formulation du modèle : « un trop-perçu » ou « un dépassement »", () => {
    const d = donneesDocxOdjCs(odjMinimal());
    expect(d.ecartLibelle).toBe("un trop-perçu");
    expect(d.ecart).toBe("3 800,00 €");
  });

  it("le budget proposé sort SANS le symbole euro (le modèle l'écrit déjà)", () => {
    expect(donneesDocxOdjCs(odjMinimal()).budgetPropose).toBe("46 500,00");
  });

  it("exercice précédent et budget N+1 se déduisent de l'année d'AG", () => {
    const d = donneesDocxOdjCs(odjMinimal());
    expect(d.exercicePrecedent).toBe("2025");
    expect(d.anneeBudget).toBe("2027");
  });

  it("les contrats sont éclatés en date d'effet / date de fin", () => {
    const d = donneesDocxOdjCs(odjMinimal());
    expect(d.gazDebut).toBe("01/01/2025");
    expect(d.gazFin).toBe("31/12/2026");
    expect(d.elecDebut).toBe("01/03/2024");
    expect(d.elecFin).toBe("");
  });

  it("les sections légales suivent l'applicabilité ; le chapeau stationnement suit IRVE ou vélo", () => {
    const d = donneesDocxOdjCs(odjMinimal());
    expect(d.ppt).toBe(true);
    expect(d.dpe).toBe(false);
    expect(d.irve).toBe(true);
    expect(d.velo).toBe(false);
    expect(d.stationnement).toBe(true);
  });

  it("une donnée inconnue rend un BLANC, jamais un placeholder", () => {
    const d = donneesDocxOdjCs(odjMinimal({ enTete: [], sections: [], pointsLegaux: [] }));
    expect(d.dateCs).toBe("");
    expect(d.depenses).toBe("");
    expect(d.ecart).toBe("");
    expect(d.ecartLibelle).toBe("un trop-perçu / un dépassement");
    expect(d.modeAg).toBe("présentiel / hybride (présentiel et visio)");
    expect(d.heureAg).toBe("18h00");
    expect(d.equipeSyndic).toBe("Gestionnaire et assistant");
    expect(d.ppt).toBe(false);
  });

  it("un champ masqué par le gestionnaire ne se rend pas", () => {
    const odj = odjMinimal();
    odj.enTete[2] = { ...odj.enTete[2]!, masque: true };
    expect(donneesDocxOdjCs(odj).lieuAg).toBe("");
  });
});

describe("helpers", () => {
  it("heureFrancaise", () => {
    expect(heureFrancaise("18:30")).toBe("18h30");
    expect(heureFrancaise("9:05")).toBe("9h05");
    expect(heureFrancaise(undefined)).toBe("");
    expect(heureFrancaise("18h30")).toBe("18h30");
  });

  it("bornesContrat", () => {
    expect(bornesContrat("EDF (jusqu'au 30/06/2027)")).toEqual({ debut: "", fin: "30/06/2027" });
    expect(bornesContrat("Otis")).toEqual({ debut: "Otis", fin: "" });
    expect(bornesContrat(undefined)).toEqual({ debut: "", fin: "" });
  });
});
