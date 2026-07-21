import { describe, it, expect } from "vitest";
import { construirePayloadFacture, tauxTvaPennylane } from "./payload";

const demandeType = {
  clientRef: "12345",
  codeEntite: "S006",
  libelle: "Depassement CS du 2026-05-12",
  dateFacture: "2026-05-13",
  lignes: [
    {
      libelle: "Honoraires de depassement - Conseil Syndical",
      detail: "Depassement CS du 12/05/2026, commence a 18:00 et termine a 21:00.",
      quantite: 1,
      prixUnitaireHt: 80,
      tauxTva: 0.2,
    },
  ],
};

describe("tauxTvaPennylane", () => {
  it("formate 20 % au format attendu", () => {
    expect(tauxTvaPennylane(0.2)).toBe("FR_200");
  });

  it("formate 10 % et 5,5 %", () => {
    expect(tauxTvaPennylane(0.1)).toBe("FR_100");
    expect(tauxTvaPennylane(0.055)).toBe("FR_55");
  });

  it("envoie un taux nul en 'exempt' (valeur relevee dans le flow legacy)", () => {
    expect(tauxTvaPennylane(0)).toBe("exempt");
  });
});

describe("construirePayloadFacture", () => {
  it("met le titre court en label et le detail en description (structure legacy)", () => {
    const p = construirePayloadFacture(demandeType);
    expect(p.invoice_lines[0]!.label).toBe("Honoraires de depassement - Conseil Syndical");
    expect(p.invoice_lines[0]!.description).toContain("termine a 21:00");
  });

  it("cree toujours un BROUILLON (jamais de facture finalisee automatiquement)", () => {
    expect(construirePayloadFacture(demandeType).draft).toBe(true);
  });

  it("reporte client et date", () => {
    const p = construirePayloadFacture(demandeType);
    expect(p.customer_id).toBe("12345");
    expect(p.date).toBe("2026-05-13");
  });

  it("pose les champs exiges par le schema Pennylane (deadline 60 j, devise, langue)", () => {
    const p = construirePayloadFacture(demandeType);
    expect(p.deadline).toBe("2026-07-12"); // 2026-05-13 + 60 j
    expect(p.currency).toBe("EUR");
    expect(p.language).toBe("fr_FR");
  });

  it("imprime le code entite (SXXX) sur le PDF, comme les 3 flows legacy", () => {
    expect(construirePayloadFacture(demandeType).pdf_invoice_free_text).toBe("S006");
  });

  it("serialise les montants en chaine a 2 decimales", () => {
    const p = construirePayloadFacture({
      ...demandeType,
      lignes: [{ ...demandeType.lignes[0]!, prixUnitaireHt: 83.333333 }],
    });
    expect(p.invoice_lines[0]!.raw_currency_unit_price).toBe("83.33");
  });

  it("transpose chaque ligne (libelle, quantite, TVA)", () => {
    const p = construirePayloadFacture({
      ...demandeType,
      lignes: [
        { libelle: "Diligence A", quantite: 1, prixUnitaireHt: 125, tauxTva: 0.2 },
        { libelle: "Diligence B", detail: "Detail B", quantite: 2, prixUnitaireHt: 100, tauxTva: 0.2 },
      ],
    });
    expect(p.invoice_lines).toHaveLength(2);
    expect(p.invoice_lines[1]).toEqual({
      label: "Diligence B",
      description: "Detail B",
      quantity: 2,
      unit: "piece",
      raw_currency_unit_price: "100.00",
      vat_rate: "FR_200",
    });
  });

  it("refuse une facture sans ligne", () => {
    expect(() => construirePayloadFacture({ ...demandeType, lignes: [] })).toThrow();
  });
});
