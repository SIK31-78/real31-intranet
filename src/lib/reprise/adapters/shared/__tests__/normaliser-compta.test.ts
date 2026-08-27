import { describe, expect, it } from "vitest";
import { normaliserGrandLivre } from "../normaliser-compta";

describe("normaliserGrandLivre - invariants du domaine", () => {
  it("normalise date JJ/MM/AAAA -> ISO, force montant positif, deduit la classe", () => {
    const jeu = normaliserGrandLivre({
      lignes: [
        { date: "05/10/2025", compte: "4500001", libelle: "Appel", sens: "debit", montant: -2000, piece: "P1" },
      ],
      notes: [],
    });
    expect(jeu.lignes).toHaveLength(1);
    expect(jeu.lignes[0]).toEqual({
      date: "2025-10-05",
      compte: "4500001",
      libelle: "Appel",
      sens: "debit",
      montant: 2000, // Math.abs applique (le sens porte le signe)
      classe: 4,
      piece: "P1",
    });
  });

  it("garde une date deja ISO et tolere le sens initiale D/C", () => {
    const jeu = normaliserGrandLivre({
      lignes: [
        { date: "2025-10-10", compte: "5120000", libelle: "Banque", sens: "C", montant: 1200 },
      ],
    });
    expect(jeu.lignes[0].date).toBe("2025-10-10");
    expect(jeu.lignes[0].sens).toBe("credit");
  });

  it("ecarte compte vide / montant nul, et COMPTE les pertes d'information (auto-check n.1)", () => {
    const jeu = normaliserGrandLivre({
      lignes: [
        { date: "01/10/2025", compte: "", libelle: "sans compte", sens: "debit", montant: 100 },
        { date: "01/10/2025", compte: "6060000", libelle: "montant nul", sens: "debit", montant: 0 },
        { date: "01/10/2025", compte: "6060000", libelle: "ok", sens: "debit", montant: 50 },
      ],
    });
    expect(jeu.lignes).toHaveLength(1);
    expect(jeu.lignes[0].libelle).toBe("ok");
    // Un MONTANT sans compte = NON RECONNUE (perte) ; un montant nul = benin (non compte).
    expect(jeu.nonReconnues).toBe(1);
    expect(jeu.notes.some((n) => /compte vide avec un montant/.test(n))).toBe(true);
    expect(jeu.notes.some((n) => /montant nul/.test(n))).toBe(true);
  });

  it("ecarte les lignes au sens indetermine (+ note)", () => {
    const jeu = normaliserGrandLivre({
      lignes: [{ date: "01/10/2025", compte: "6060000", libelle: "?", sens: "xyz", montant: 100 }],
    });
    expect(jeu.lignes).toHaveLength(0);
    expect(jeu.notes.some((n) => /sens debit\/credit indetermine/.test(n))).toBe(true);
  });

  it("ecarte defensivement un compte hors classes 1-7 (+ note) sans planter", () => {
    const jeu = normaliserGrandLivre({
      lignes: [
        { date: "01/10/2025", compte: "8010000", libelle: "hors plan", sens: "debit", montant: 100 },
        { date: "01/10/2025", compte: "7010000", libelle: "ok", sens: "credit", montant: 100 },
      ],
    });
    expect(jeu.lignes).toHaveLength(1);
    expect(jeu.lignes[0].compte).toBe("7010000");
    expect(jeu.notes.some((n) => /hors classes comptables 1-7/.test(n))).toBe(true);
  });

  it("conserve les notes du modele et tolere une entree vide", () => {
    const jeu = normaliserGrandLivre({ notes: ["note modele"] });
    expect(jeu.lignes).toHaveLength(0);
    expect(jeu.notes).toContain("note modele");
  });
});
