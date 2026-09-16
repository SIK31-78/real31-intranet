import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FacturationRepository, NouvelleFacture } from "@/lib/ports/facturation-repository";

// Le suivi de sinistre : une ligne par diligence retenue, tarifee au bareme du contrat ;
// zero diligence = pas de facture (audit 16/09/2026 : service sans test).

const etat = vi.hoisted(() => ({ creees: [] as NouvelleFacture[] }));
const BAREME: Record<string, number> = { DossierAssureur: 162, DepLieu: 96, MesConser: 120, AssExp: 240 };

vi.mock("@/lib/services/coproprietes/exiger-perimetre", () => ({ exigerPerimetre: async () => undefined }));
vi.mock("@/lib/adapters/router", () => ({
  getFacturationRepository: () =>
    ({
      async getDernierContrat() {
        return { coproCode: "S072", debutContrat: "2025-07-01" };
      },
      async getTarifTtc(id: string) {
        return BAREME[id] ?? null;
      },
      async creerFacture(input: NouvelleFacture) {
        etat.creees.push(input);
        return `facture-${etat.creees.length}`;
      },
    }) satisfies Partial<Record<keyof FacturationRepository, unknown>>,
}));

import { apercuSuiviSinistre, creerFactureSuiviSinistre } from "./creer-facture-suivi-sinistre";

beforeEach(() => {
  etat.creees = [];
});

describe("creerFactureSuiviSinistre", () => {
  it("deux diligences : deux lignes HT, le bareme de l'annee du contrat, la reference du sinistre dans les details", async () => {
    const r = await creerFactureSuiviSinistre(
      { coproCode: "S072", libelleSinistre: "S072DODUPINDDE", diligences: { dossierAssureur: true, assistanceExpertise: true }, dateSinistre: "2026-08-01", par: "EL" },
      "m1",
    );
    expect(r.factureId).toBe("facture-1");
    expect(r.montantHt).toBeCloseTo(162 / 1.2 + 240 / 1.2, 2);
    const f = etat.creees[0]!;
    expect(f.lignes).toHaveLength(2);
    expect(f.lignes.map((l) => l.prixUnitaireHt)).toEqual([135, 200]);
    expect(f).toMatchObject({ typePrestation: "suivi_sinistre", libelle: "Suivi de sinistre - S072DODUPINDDE", datePrestation: "2026-08-01", par: "EL" });
    expect(f.details).toMatchObject({ libelleSinistre: "S072DODUPINDDE", anneeBareme: 2025 });
  });
  it("les quatre diligences font quatre lignes ; une diligence a « non » n'en fait pas", async () => {
    await creerFactureSuiviSinistre(
      { coproCode: "S072", libelleSinistre: "X", diligences: { dossierAssureur: true, deplacementLieux: true, mesuresConservatoires: true, assistanceExpertise: true } },
      "m1",
    );
    await creerFactureSuiviSinistre({ coproCode: "S072", libelleSinistre: "X", diligences: { dossierAssureur: true, deplacementLieux: false } }, "m1");
    expect(etat.creees.map((f) => f.lignes.length)).toEqual([4, 1]);
  });
  it("aucune diligence : erreur explicite, rien n'est cree", async () => {
    await expect(creerFactureSuiviSinistre({ coproCode: "S072", libelleSinistre: "X", diligences: {} }, "m1")).rejects.toThrow(/aucune diligence retenue/);
    expect(etat.creees).toHaveLength(0);
  });
});

describe("apercuSuiviSinistre", () => {
  it("sans diligence : « rien a facturer » dit a l'ecran, pas une exception", async () => {
    const a = await apercuSuiviSinistre({ coproCode: "S072", libelleSinistre: "X", diligences: {} }, "m1");
    expect(a.rienAFacturer).toBe(true);
    expect(a.motifRienAFacturer).toMatch(/Aucune diligence retenue/);
  });
  it("avec diligences : le compte et le montant TTC", async () => {
    const a = await apercuSuiviSinistre({ coproCode: "S072", libelleSinistre: "X", diligences: { deplacementLieux: true } }, "m1");
    expect(a.details.find((d) => d.libelle === "Diligences retenues")!.valeur).toBe("1 sur 4");
    expect(a.montantTtc).toBeCloseTo(96, 2);
    expect(etat.creees).toHaveLength(0);
  });
});
