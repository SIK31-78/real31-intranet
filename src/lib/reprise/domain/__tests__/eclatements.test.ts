// Tests de la fiche d'eclatements (classes 1/7) : soldes par compte, sens/valeur absolue,
// controle du detail reel, consignes metier (105/1031 par lot, 701 par cle). Donnees synthetiques.
import { describe, expect, it } from "vitest";
import type { ControleCompte, LigneEcriture } from "../ecriture";
import { construireFicheEclatements, type DetailsParCompte } from "../eclatements";

const l = (compte: string, date: string, montant: number, sens: "debit" | "credit"): LigneEcriture => ({
  date,
  compte,
  libelle: "x",
  sens,
  montant,
  classe: Number(compte[0]) as LigneEcriture["classe"],
});

const LIGNES: LigneEcriture[] = [
  l("7010000", "2025-01-15", 1000, "credit"),
  l("7010000", "2025-04-15", 1000, "credit"),
  l("1031001", "2025-01-01", 0, "debit"), // sans effet
];
const CONTROLES: ControleCompte[] = [
  { compte: "1031001", reportCredit: 1219.59 },
  { compte: "1050001", reportCredit: 500 },
];
const VISES = ["7010000", "1031001", "1050001"];

describe("construireFicheEclatements", () => {
  it("calcule le solde signe (reports inclus) et le rend en sens + valeur absolue", () => {
    const fiche = construireFicheEclatements(LIGNES, CONTROLES, VISES);
    const parCompte = new Map(fiche.comptes.map((c) => [c.compteSource, c]));

    const c701 = parCompte.get("7010000")!;
    expect(c701.soldeSigne).toBe(-2000);
    expect(c701.sens).toBe("credit");
    expect(c701.montant).toBe(2000);

    const c1031 = parCompte.get("1031001")!;
    expect(c1031.soldeSigne).toBe(-1219.59);
    expect(c1031.montant).toBe(1219.59);

    // Total signe = complement attendu de la balance apres entries.xlsx.
    expect(fiche.totalSigne).toBe(-3719.59);
  });

  it("porte les consignes metier : 1031 par LOT (jamais par tantiemes), 701 par CLE", () => {
    const fiche = construireFicheEclatements(LIGNES, CONTROLES, VISES);
    const parCompte = new Map(fiche.comptes.map((c) => [c.compteSource, c]));
    expect(parCompte.get("1031001")!.consignes.join(" ")).toMatch(/PAS proportionnelle aux tantiemes/);
    expect(parCompte.get("7010000")!.consignes.join(" ")).toMatch(/PAR CLE/);
    expect(parCompte.get("7010000")!.consignes.join(" ")).toMatch(/Compenser en 450/);
  });

  it("sans detail reel fourni -> warning 'a completer avant saisie' (jamais un silence)", () => {
    const fiche = construireFicheEclatements(LIGNES, CONTROLES, VISES);
    expect(fiche.warnings.filter((w) => /aucun detail reel/.test(w))).toHaveLength(3);
  });

  it("un detail fourni qui ne retombe pas sur le solde -> warning d'ecart", () => {
    const details: DetailsParCompte = {
      "1031001": [
        { ligne: "Lot 101", montant: -609.79 },
        { ligne: "Lot 102", montant: -600 }, // total -1209.79 != -1219.59
      ],
    };
    const fiche = construireFicheEclatements(LIGNES, CONTROLES, VISES, details);
    expect(fiche.warnings.some((w) => w.includes("1031001") && /ne retombe pas/.test(w))).toBe(true);
  });

  it("un detail juste au centime -> aucun warning pour ce compte", () => {
    const details: DetailsParCompte = {
      "1031001": [
        { ligne: "Lot 101", montant: -609.79 },
        { ligne: "Lot 102", montant: -609.8 },
      ],
    };
    const fiche = construireFicheEclatements(LIGNES, CONTROLES, VISES, details);
    expect(fiche.warnings.some((w) => w.includes("1031001") && /ne retombe pas/.test(w))).toBe(false);
  });

  it("un compte vise mais solde a zero n'apparait pas (rien a saisir)", () => {
    const fiche = construireFicheEclatements([l("7020000", "2025-01-01", 10, "debit"), l("7020000", "2025-02-01", 10, "credit")], [], ["7020000"]);
    expect(fiche.comptes).toEqual([]);
    expect(fiche.totalSigne).toBe(0);
  });
});
