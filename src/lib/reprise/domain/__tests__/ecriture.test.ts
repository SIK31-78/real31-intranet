import { describe, expect, it } from "vitest";
import {
  balanceDesEcritures,
  grouperEcrituresParCompte,
  verifierEquilibreGrandLivre,
  type LigneEcriture,
  type SensEcriture,
} from "../ecriture";
import { classeDe } from "../compta";

/** Fabrique une LigneEcriture (classe derivee du compte). */
function ligne(compte: string, sens: SensEcriture, montant: number): LigneEcriture {
  return { date: "2025-10-01", compte, libelle: "test", sens, montant, classe: classeDe(compte) };
}

describe("balanceDesEcritures - agregation par classe", () => {
  it("cumule debit/credit par compte puis par classe", () => {
    const b = balanceDesEcritures([
      ligne("4010000", "credit", 1200),
      ligne("6220000", "debit", 1200),
      ligne("4500001", "debit", 2000),
      ligne("7010000", "credit", 2000),
      ligne("5120000", "debit", 2000),
      ligne("4500001", "credit", 2000),
    ]);
    // Classe 4 : 401 credit 1200 + 450 debit 2000 + 450 credit 2000.
    expect(b.parClasse[4]).toEqual({ debit: 2000, credit: 3200, solde: -1200 });
    expect(b.parClasse[5]).toEqual({ debit: 2000, credit: 0, solde: 2000 });
    expect(b.parClasse[6]).toEqual({ debit: 1200, credit: 0, solde: 1200 });
    expect(b.parClasse[7]).toEqual({ debit: 0, credit: 2000, solde: -2000 });
  });

  it("additionne plusieurs ecritures d'un meme compte sans bruit flottant", () => {
    const b = balanceDesEcritures([
      ligne("6060000", "debit", 0.1),
      ligne("6060000", "debit", 0.2),
      ligne("7010000", "credit", 0.3),
    ]);
    expect(b.parClasse[6].debit).toBe(0.3);
    expect(b.ecart).toBe(0);
  });
});

describe("verifierEquilibreGrandLivre - auto-check fort", () => {
  it("equilibre=true pour un grand livre complet (debit==credit)", () => {
    // 4 operations en partie double -> parfaitement equilibre.
    const eq = verifierEquilibreGrandLivre([
      ligne("6220000", "debit", 1200),
      ligne("4010000", "credit", 1200),
      ligne("4500001", "debit", 2000),
      ligne("7010000", "credit", 2000),
      ligne("5120000", "debit", 2000),
      ligne("4500001", "credit", 2000),
      ligne("4010000", "debit", 1200),
      ligne("5120000", "credit", 1200),
    ]);
    expect(eq.equilibre).toBe(true);
    expect(eq.ecart).toBe(0);
  });

  it("equilibre=false + ecart signe si une contrepartie manque", () => {
    // On oublie le credit du produit 701 -> desequilibre de 2000 au debit.
    const eq = verifierEquilibreGrandLivre([
      ligne("4500001", "debit", 2000),
      ligne("5120000", "debit", 2000),
      ligne("4500001", "credit", 2000),
    ]);
    expect(eq.equilibre).toBe(false);
    expect(eq.ecart).toBe(2000);
  });

  it("expose le detail par classe (7 clefs toujours presentes)", () => {
    const eq = verifierEquilibreGrandLivre([ligne("6060000", "debit", 500), ligne("7010000", "credit", 500)]);
    expect(eq.parClasse[1]).toEqual({ debit: 0, credit: 0, solde: 0 });
    expect(eq.parClasse[6].debit).toBe(500);
    expect(eq.parClasse[7].credit).toBe(500);
  });
});

describe("grouperEcrituresParCompte - vue grand livre par compte", () => {
  it("groupe par compte source, mappe sens->debit/credit et totalise", () => {
    const g = grouperEcrituresParCompte([
      ligne("4501.100", "debit", 500),
      ligne("4501.100", "credit", 200),
      ligne("5120.000", "debit", 800),
    ]);
    expect(Object.keys(g)).toEqual(["4501.100", "5120.000"]);

    const c = g["4501.100"];
    expect(c.nbLignes).toBe(2);
    expect(c.lignes[0]).toMatchObject({ debit: 500, credit: 0 });
    expect(c.lignes[1]).toMatchObject({ debit: 0, credit: 200 });
    expect(c.totalDebit).toBe(500);
    expect(c.totalCredit).toBe(200);
    expect(c.solde).toBe(300);
  });

  it("conserve la piece quand elle est presente et l'ordre d'apparition des lignes", () => {
    const l1: LigneEcriture = { ...ligne("4010.1", "credit", 100), piece: "FA-1", libelle: "Facture 1" };
    const l2: LigneEcriture = { ...ligne("4010.1", "credit", 50), libelle: "Facture 2" };
    const g = grouperEcrituresParCompte([l1, l2]);
    expect(g["4010.1"].lignes[0]).toMatchObject({ piece: "FA-1", libelle: "Facture 1" });
    expect(g["4010.1"].lignes[1].piece).toBeUndefined();
    expect(g["4010.1"].totalCredit).toBe(150);
  });

  it("additionne sans bruit flottant (arrondi centime)", () => {
    const g = grouperEcrituresParCompte([
      ligne("6060.0", "debit", 0.1),
      ligne("6060.0", "debit", 0.2),
    ]);
    expect(g["6060.0"].totalDebit).toBe(0.3);
    expect(g["6060.0"].solde).toBe(0.3);
  });
});
