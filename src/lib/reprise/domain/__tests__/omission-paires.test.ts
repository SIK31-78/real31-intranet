// Tests de l'omission des paires de repartition comptabilisee en N+1 (cas Matera / S0303).
// Le declencheur est ARITHMETIQUE (jamais le libelle) et la garde est stricte : UN SEUL
// compte de classe 6 qui ne s'annule pas => on n'omet RIEN. Donnees synthetiques.
import { describe, expect, it } from "vitest";
import type { ControleCompte, LigneEcriture } from "../ecriture";
import { appliquerOmission, detecterPairesRepartition } from "../omission-paires";

const l = (compte: string, date: string, montant: number, sens: "debit" | "credit", libelle = "x"): LigneEcriture => ({
  date,
  compte,
  libelle,
  sens,
  montant,
  classe: Number(compte[0]) as LigneEcriture["classe"],
});

// GL N (en cours) : deux comptes de classe 6 avec a-nouveau (les charges N-1 non reparties)
// + un bloc au 15/06 (la date de l'AG) qui les credite exactement + des charges nouvelles.
const LIGNES: LigneEcriture[] = [
  // bloc de repartition du 15/06 (libelles VOLONTAIREMENT quelconques : jamais le libelle).
  l("6060000", "2025-06-15", 300, "credit", "ecriture quelconque"),
  l("6150000", "2025-06-15", 150.5, "credit", "autre texte libre"),
  // vraies charges du nouvel exercice, sur les MEMES comptes.
  l("6060000", "2025-07-01", 80, "debit"),
  l("6150000", "2025-08-01", 40, "debit"),
  // classe 4 (hors sujet).
  l("4500001", "2025-07-01", 80, "credit"),
];
const CONTROLES: ControleCompte[] = [
  { compte: "6060000", reportDebit: 300 },
  { compte: "6150000", reportDebit: 150.5 },
  { compte: "4500001", reportDebit: 12 }, // classe 4 : report normal, jamais concerne
];

describe("detecterPairesRepartition", () => {
  it("detecte le bloc quand TOUS les comptes 6 s'annulent au centime a la meme date", () => {
    const v = detecterPairesRepartition(LIGNES, CONTROLES);
    expect(v.applicable).toBe(true);
    expect(v.dateRepartition).toBe("2025-06-15");
    expect(v.paires.map((p) => p.compte).sort()).toEqual(["6060000", "6150000"]);
    expect(v.comptesNonAnnules).toEqual([]);
  });

  it("REFUSE des qu'UN compte ne s'annule pas exactement (garde arithmetique)", () => {
    const controlesFaux: ControleCompte[] = [
      { compte: "6060000", reportDebit: 300 },
      { compte: "6150000", reportDebit: 150.6 }, // 10 centimes d'ecart avec le bloc du 15/06
    ];
    const v = detecterPairesRepartition(LIGNES, controlesFaux);
    expect(v.applicable).toBe(false);
    expect(v.comptesNonAnnules.map((c) => c.compte)).toEqual(["6150000"]);
    expect(v.notes.some((n) => /REFUSEE/.test(n))).toBe(true);
  });

  it("aucun report de classe 6 -> rien a omettre (cas nominal)", () => {
    const v = detecterPairesRepartition(LIGNES, [{ compte: "4500001", reportDebit: 12 }]);
    expect(v.applicable).toBe(false);
    expect(v.paires).toEqual([]);
    expect(v.notes.some((n) => /rien a omettre/i.test(n))).toBe(true);
  });

  it("ne se declenche JAMAIS sur le libelle : un 'Cloture N-1' au mauvais montant ne suffit pas", () => {
    const lignes = [l("6060000", "2025-06-15", 299, "credit", "Cloture N-1")];
    const v = detecterPairesRepartition(lignes, [{ compte: "6060000", reportDebit: 300 }]);
    expect(v.applicable).toBe(false);
  });
});

describe("appliquerOmission", () => {
  it("retire les ecritures du bloc et neutralise les reports des comptes omis", () => {
    const v = detecterPairesRepartition(LIGNES, CONTROLES);
    const r = appliquerOmission(LIGNES, CONTROLES, v);
    expect(r.nbPairesOmises).toBe(2);
    // Les deux ecritures du 15/06 sont parties ; les charges reelles restent.
    expect(r.lignes).toHaveLength(3);
    expect(r.lignes.some((x) => x.date === "2025-06-15")).toBe(false);
    // Reports 6 neutralises, report 4 intact.
    const parCompte = new Map(r.controles.map((c) => [c.compte, c]));
    expect(parCompte.get("6060000")).toMatchObject({ reportDebit: 0, reportCredit: 0 });
    expect(parCompte.get("4500001")).toMatchObject({ reportDebit: 12 });
  });

  it("verdict non applicable => identite (rien n'est retire)", () => {
    const v = detecterPairesRepartition(LIGNES, [{ compte: "6060000", reportDebit: 1 }]);
    const r = appliquerOmission(LIGNES, CONTROLES, v);
    expect(r.lignes).toHaveLength(LIGNES.length);
    expect(r.nbPairesOmises).toBe(0);
  });
});
