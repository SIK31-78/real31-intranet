// Tests du parseur deterministe : donnees markdown 100 % SYNTHETIQUES (inventees, aucune vraie
// data). On couvre les deux presentations (deux colonnes / montant signe), reports + totaux,
// nombres francais, ligne inparsable -> note, capture des totaux de compte.
import { describe, expect, it } from "vitest";
import { parseNombreFr, parserGrandLivre } from "../parseur-grand-livre";
import type { SpecFormatGrandLivre } from "../format-grand-livre";

const SPEC_DEUX_COLONNES: SpecFormatGrandLivre = {
  presentation: "deux-colonnes",
  motifEnteteCompte: "^#?\\s*(\\d{3,}\\S*)\\s+\\D.*$",
  colonnes: { compte: null, date: 0, libelle: 1, piece: 2, debit: 3, credit: 4, montant: null, sens: null },
  signePositif: "debit",
  motsClesReport: ["report", "a nouveau", "solde anterieur"],
  motsClesTotalCompte: ["total compte"],
};

const SPEC_MONTANT_SIGNE: SpecFormatGrandLivre = {
  presentation: "montant-signe",
  motifEnteteCompte: "^Compte\\s+(\\d{3,}\\S*)\\b.*$",
  colonnes: { compte: null, date: 0, libelle: 1, piece: null, debit: null, credit: null, montant: 2, sens: null },
  signePositif: "debit",
  motsClesReport: ["report"],
  motsClesTotalCompte: ["total"],
};

describe("parseNombreFr - nombres francais", () => {
  it("gere espaces (dont insecables), virgule decimale, points de milliers", () => {
    expect(parseNombreFr("1 234,56")).toBe(1234.56);
    expect(parseNombreFr("1 234,56")).toBe(1234.56);
    expect(parseNombreFr("1.234.567,89")).toBe(1234567.89);
    expect(parseNombreFr("42,00 €")).toBe(42);
  });
  it("gere negatif par signe et par parentheses", () => {
    expect(parseNombreFr("-100,00")).toBe(-100);
    expect(parseNombreFr("(250,40)")).toBe(-250.4);
  });
  it("renvoie null sur une cellule non numerique", () => {
    expect(parseNombreFr("Debit")).toBeNull();
    expect(parseNombreFr("")).toBeNull();
    expect(parseNombreFr("   ")).toBeNull();
  });
});

describe("parserGrandLivre - presentation deux colonnes", () => {
  const page = [
    "# 401000 FOURNISSEURS DIVERS",
    "| Date | Libelle | Piece | Debit | Credit |",
    "|------|---------|-------|-------|--------|",
    "| 01/10/2025 | Facture entretien | FA1 |  | 1 200,00 |",
    "| 15/10/2025 | Reglement facture | CH1 | 1 200,00 |  |",
    "| Report a nouveau |  |  | 0,00 | 0,00 |",
    "| Total compte 401000 |  |  | 1 200,00 | 1 200,00 |",
    "",
    "## 512000 BANQUE",
    "| Date | Libelle | Piece | Debit | Credit |",
    "|------|---------|-------|-------|--------|",
    "| 15/10/2025 | Reglement facture | CH1 |  | 1 200,00 |",
    "| 20/10/2025 | Encaissement AF | VR1 | 800,00 |  |",
    "| Total compte 512000 |  |  | 800,00 | 1 200,00 |",
  ].join("\n");

  it("extrait les ecritures, suit le compte, exclut report/total", () => {
    const r = parserGrandLivre([page], SPEC_DEUX_COLONNES);
    expect(r.lignes).toHaveLength(4);
    // 1re ecriture : credit 1200 sur 401000.
    expect(r.lignes[0]).toMatchObject({ compte: "401000", sens: "credit", montant: 1200, piece: "FA1" });
    // 2e : debit 1200 sur 401000.
    expect(r.lignes[1]).toMatchObject({ compte: "401000", sens: "debit", montant: 1200 });
    // Compte bascule sur 512000.
    expect(r.lignes[2].compte).toBe("512000");
    expect(r.lignes[3]).toMatchObject({ compte: "512000", sens: "debit", montant: 800 });
  });

  it("capture les totaux imprimes par compte (controle)", () => {
    const r = parserGrandLivre([page], SPEC_DEUX_COLONNES);
    const c401 = r.controles.find((c) => c.compte === "401000");
    const c512 = r.controles.find((c) => c.compte === "512000");
    expect(c401).toEqual({ compte: "401000", totalDebit: 1200, totalCredit: 1200 });
    expect(c512).toEqual({ compte: "512000", totalDebit: 800, totalCredit: 1200 });
  });
});

describe("parserGrandLivre - presentation montant signe", () => {
  const page = [
    "Compte 606000 FOURNITURES",
    "| Date | Libelle | Montant |",
    "|------|---------|---------|",
    "| 02/10/2025 | Achat ampoules | 150,00 |",
    "| 09/10/2025 | Avoir fournisseur | -30,00 |",
    "| Report periode |  | 0,00 |",
  ].join("\n");

  it("deduit le sens depuis le signe (positif=debit par defaut)", () => {
    const r = parserGrandLivre([page], SPEC_MONTANT_SIGNE);
    expect(r.lignes).toHaveLength(2);
    expect(r.lignes[0]).toMatchObject({ compte: "606000", sens: "debit", montant: 150 });
    expect(r.lignes[1]).toMatchObject({ compte: "606000", sens: "credit", montant: 30 });
  });
});

describe("parserGrandLivre - robustesse", () => {
  it("une ligne datee sans montant lisible devient une note, pas un crash", () => {
    const page = [
      "# 401000 FOURNISSEURS",
      "| Date | Libelle | Piece | Debit | Credit |",
      "|------|---------|-------|-------|--------|",
      "| 03/10/2025 | Ligne illisible | X | ??? | n/a |",
      "| 04/10/2025 | Facture nette | Y |  | 90,00 |",
    ].join("\n");
    const r = parserGrandLivre([page], SPEC_DEUX_COLONNES);
    expect(r.lignes).toHaveLength(1);
    expect(r.notes.some((n) => /sans montant lisible/.test(n))).toBe(true);
  });

  it("tolere pages vides, separateurs et cellules fusionnees sans planter", () => {
    const r = parserGrandLivre(["", "   ", "|---|---|"], SPEC_DEUX_COLONNES);
    expect(r.lignes).toHaveLength(0);
    expect(r.notes.length).toBeGreaterThan(0);
  });
});
