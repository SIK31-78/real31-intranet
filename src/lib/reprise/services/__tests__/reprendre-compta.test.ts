import { describe, expect, it } from "vitest";
import { extraireEtVerifierGrandLivre } from "../reprendre-compta";
import { MockComptaExtractionProvider } from "@/lib/reprise/adapters/compta-extraction/mock-provider";
import { normaliserGrandLivre } from "@/lib/reprise/adapters/shared/normaliser-compta";

const AUCUN_DOC = [] as const;

describe("extraireEtVerifierGrandLivre - mock equilibre par defaut", () => {
  it("extrait le grand livre de demonstration et le trouve equilibre", async () => {
    const res = await extraireEtVerifierGrandLivre(new MockComptaExtractionProvider(), [...AUCUN_DOC]);
    expect(res.jeu.lignes.length).toBeGreaterThan(0);
    expect(res.equilibreGlobal.equilibre).toBe(true);
    expect(res.equilibreGlobal.ecart).toBe(0);
    expect(res.balance.equilibre).toBe(true);
    // Les 4 classes du jeu de demo sont presentes dans la balance.
    expect(res.balance.parClasse[4].debit).toBeGreaterThan(0);
    expect(res.balance.parClasse[5].debit).toBeGreaterThan(0);
    expect(res.balance.parClasse[6].debit).toBeGreaterThan(0);
    expect(res.balance.parClasse[7].credit).toBeGreaterThan(0);
  });

  it("expose le BLOC A = uniquement les classes 4 et 5", async () => {
    const res = await extraireEtVerifierGrandLivre(new MockComptaExtractionProvider(), [...AUCUN_DOC]);
    expect(res.blocA.length).toBeGreaterThan(0);
    expect(res.blocA.every((l) => l.classe === 4 || l.classe === 5)).toBe(true);
    // Aucune ligne de classe 6/7 dans le bloc A.
    expect(res.blocA.some((l) => l.classe === 6 || l.classe === 7)).toBe(false);
  });

  it("n'ajoute pas de note de desequilibre quand la balance tombe a 0", async () => {
    const res = await extraireEtVerifierGrandLivre(new MockComptaExtractionProvider(), [...AUCUN_DOC]);
    expect(res.jeu.notes.some((n) => /DESEQUILIBRE/.test(n))).toBe(false);
  });
});

describe("extraireEtVerifierGrandLivre - detection du desequilibre", () => {
  it("signale un grand livre desequilibre (ecriture manquante) via une note", async () => {
    // Jeu incomplet : appel de fonds au debit sans son produit au credit -> desequilibre.
    const jeuBancal = normaliserGrandLivre({
      lignes: [
        { date: "05/10/2025", compte: "4500001", libelle: "Appel", sens: "debit", montant: 2000 },
        { date: "10/10/2025", compte: "5120000", libelle: "Encaissement", sens: "debit", montant: 2000 },
        { date: "10/10/2025", compte: "4500001", libelle: "Encaissement", sens: "credit", montant: 2000 },
      ],
    });
    const res = await extraireEtVerifierGrandLivre(new MockComptaExtractionProvider(jeuBancal), [...AUCUN_DOC]);
    expect(res.equilibreGlobal.equilibre).toBe(false);
    expect(res.equilibreGlobal.ecart).toBe(2000);
    expect(res.jeu.notes.some((n) => /DESEQUILIBRE/.test(n))).toBe(true);
  });
});
