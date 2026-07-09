import { describe, expect, it } from "vitest";
import { verifierTotauxParCompte } from "../controle-comptes";
import type { ControleCompte, LigneEcriture, SensEcriture } from "../ecriture";
import { classeDe } from "../compta";

/** Fabrique une LigneEcriture (classe derivee du compte). */
function ligne(compte: string, sens: SensEcriture, montant: number): LigneEcriture {
  return { date: "2025-10-01", compte, libelle: "x", sens, montant, classe: classeDe(compte) };
}

describe("verifierTotauxParCompte", () => {
  const lignes: LigneEcriture[] = [
    ligne("401000", "credit", 1200),
    ligne("401000", "debit", 1200),
    ligne("512000", "debit", 800),
    ligne("512000", "credit", 1200),
  ];

  it("aucun ecart quand les sommes retombent sur les totaux imprimes", () => {
    const controles: ControleCompte[] = [
      { compte: "401000", totalDebit: 1200, totalCredit: 1200 },
      { compte: "512000", totalDebit: 800, totalCredit: 1200 },
    ];
    const r = verifierTotauxParCompte(lignes, controles);
    expect(r.nbComptesControles).toBe(2);
    expect(r.nbEnEcart).toBe(0);
    expect(r.enEcart).toHaveLength(0);
  });

  it("localise un compte en ecart (somme != total imprime)", () => {
    const controles: ControleCompte[] = [
      { compte: "401000", totalDebit: 1200, totalCredit: 1200 },
      { compte: "512000", totalDebit: 800, totalCredit: 1500 }, // credit imprime faux
    ];
    const r = verifierTotauxParCompte(lignes, controles);
    expect(r.nbComptesControles).toBe(2);
    expect(r.nbEnEcart).toBe(1);
    expect(r.enEcart[0].compte).toBe("512000");
    expect(r.enEcart[0].ecartCredit).toBe(-300); // calcule 1200 - imprime 1500
    expect(r.enEcart[0].ecartDebit).toBe(0);
  });

  it("un compte sans total imprime n'est pas controle (info, pas erreur)", () => {
    const controles: ControleCompte[] = [{ compte: "401000" }];
    const r = verifierTotauxParCompte(lignes, controles);
    expect(r.nbComptesControles).toBe(0);
    expect(r.nbEnEcart).toBe(0);
  });

  it("controle un seul cote quand un seul total est imprime", () => {
    const controles: ControleCompte[] = [{ compte: "512000", totalDebit: 999 }];
    const r = verifierTotauxParCompte(lignes, controles);
    expect(r.nbComptesControles).toBe(1);
    expect(r.enEcart[0].ecartDebit).toBe(-199); // 800 - 999
    expect(r.enEcart[0].ecartCredit).toBeUndefined();
  });

  it("tolere le bruit d'arrondi sous le seuil", () => {
    const controles: ControleCompte[] = [{ compte: "401000", totalDebit: 1200.002, totalCredit: 1200 }];
    const r = verifierTotauxParCompte(lignes, controles);
    expect(r.nbEnEcart).toBe(0);
  });

  it("reconcilie l'a-nouveau : report + ecritures == total imprime (pas d'ecart)", () => {
    // Le total imprime inclut un report d'ouverture debit de 500 que l'on n'extrait pas en
    // ecriture. Sans reconciliation ce serait un faux positif ; avec, l'ecart est nul.
    const controles: ControleCompte[] = [
      { compte: "512000", totalDebit: 1300, totalCredit: 1200, reportDebit: 500 },
    ];
    const r = verifierTotauxParCompte(lignes, controles);
    expect(r.nbComptesControles).toBe(1);
    expect(r.nbEnEcart).toBe(0); // 500 (report) + 800 (ecritures) == 1300 imprime
  });

  it("localise une VRAIE erreur meme apres reintegration du report", () => {
    // report 500 + ecritures 800 = 1300, or le total imprime est 1350 -> ecart reel de -50.
    const controles: ControleCompte[] = [
      { compte: "512000", totalDebit: 1350, reportDebit: 500 },
    ];
    const r = verifierTotauxParCompte(lignes, controles);
    expect(r.nbEnEcart).toBe(1);
    expect(r.enEcart[0].ecartDebit).toBe(-50);
    expect(r.enEcart[0].reportDebit).toBe(500);
  });
});
