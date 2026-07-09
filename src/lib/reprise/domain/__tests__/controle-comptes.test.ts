import { describe, expect, it } from "vitest";
import { balanceParCompte, verifierTotauxParCompte } from "../controle-comptes";
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

describe("balanceParCompte", () => {
  const ecr = (compte: string, sens: SensEcriture, montant: number): LigneEcriture => ({
    date: "2026-01-15",
    compte,
    libelle: "TEST",
    sens,
    montant,
    classe: classeDe(compte),
  });

  it("construit la balance complete triee avec statuts ok / ecart / non_controle", () => {
    const lignes = [ecr("450100", "debit", 100), ecr("401200", "credit", 60), ecr("512000", "debit", 40)];
    const controles: ControleCompte[] = [
      { compte: "450100", totalDebit: 100 }, // reconcilie
      { compte: "401200", totalCredit: 80 }, // ecart de -20
      // 512000 : aucun total imprime -> non controle
    ];
    const b = balanceParCompte(lignes, controles, { "450100": "COPRO TEST" });
    expect(b.map((l) => l.compte)).toEqual(["401200", "450100", "512000"]); // tri par compte
    const l450 = b.find((l) => l.compte === "450100")!;
    expect(l450.statut).toBe("ok");
    expect(l450.intitule).toBe("COPRO TEST");
    expect(l450.solde).toBe(100);
    const l401 = b.find((l) => l.compte === "401200")!;
    expect(l401.statut).toBe("ecart");
    expect(l401.ecartCredit).toBe(-20);
    expect(l401.solde).toBe(-60);
    const l512 = b.find((l) => l.compte === "512000")!;
    expect(l512.statut).toBe("non_controle");
  });

  it("reintegre le report a-nouveau dans le solde et le controle", () => {
    const lignes = [ecr("450100", "debit", 800)];
    const controles: ControleCompte[] = [{ compte: "450100", totalDebit: 1300, reportDebit: 500 }];
    const b = balanceParCompte(lignes, controles);
    expect(b[0].statut).toBe("ok"); // 500 + 800 == 1300
    expect(b[0].solde).toBe(1300);
    expect(b[0].reportDebit).toBe(500);
  });

  it("inclut un compte present uniquement dans les controles (aucune ecriture)", () => {
    const b = balanceParCompte([], [{ compte: "450900", totalDebit: 250, reportDebit: 250 }]);
    expect(b).toHaveLength(1);
    expect(b[0].statut).toBe("ok"); // 250 (report) + 0 == 250
  });
});
