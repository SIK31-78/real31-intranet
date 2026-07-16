import { describe, it, expect } from "vitest";
import { calculerDureeContrat, dureeContratTexte } from "./duree-contrat";

describe("calculerDureeContrat", () => {
  it("regle d'arrondi : contrat cale 01/07 -> 30/06 s'affiche « 1 an »", () => {
    // 11 mois + 29 jours -> +1 an, 0 mois, 0 jour (cas metier central).
    expect(calculerDureeContrat("2025-07-01", "2026-06-30")).toEqual({ annees: 1, mois: 0, jours: 0 });
    expect(dureeContratTexte("2025-07-01", "2026-06-30")).toBe("1 an, 0 mois, 0 jour");
  });

  it("cas normal sans emprunt", () => {
    expect(calculerDureeContrat("2025-01-01", "2026-03-15")).toEqual({ annees: 1, mois: 2, jours: 14 });
    expect(dureeContratTexte("2025-01-01", "2026-03-15")).toBe("1 an, 2 mois, 14 jours");
  });

  it("emprunt de jours sur fevrier non bissextile (28 j)", () => {
    expect(calculerDureeContrat("2025-01-20", "2026-03-15")).toEqual({ annees: 1, mois: 1, jours: 23 });
  });

  it("emprunt de jours sur fevrier bissextile (29 j)", () => {
    expect(calculerDureeContrat("2024-01-20", "2024-03-10")).toEqual({ annees: 0, mois: 1, jours: 19 });
  });

  it("emprunt de mois (mois de fin < mois de debut)", () => {
    expect(calculerDureeContrat("2025-11-10", "2026-03-05")).toEqual({ annees: 0, mois: 3, jours: 23 });
  });

  it("emprunt de jours quand le mois de fin est janvier (bascule decembre annee-1)", () => {
    expect(calculerDureeContrat("2025-11-15", "2026-01-05")).toEqual({ annees: 0, mois: 1, jours: 21 });
  });

  it("pluriel : singulier pour 1 an / 1 jour", () => {
    expect(dureeContratTexte("2024-01-01", "2025-01-02")).toBe("1 an, 0 mois, 1 jour");
  });

  it("pluriel : pluriel pour 2 ans / 2 jours", () => {
    expect(dureeContratTexte("2024-01-01", "2026-01-03")).toBe("2 ans, 0 mois, 2 jours");
  });

  it("rejette des dates inversees (fin avant debut)", () => {
    expect(() => calculerDureeContrat("2026-06-30", "2025-07-01")).toThrow();
  });
});
