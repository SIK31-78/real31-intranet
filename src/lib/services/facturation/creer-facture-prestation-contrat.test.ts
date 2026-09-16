import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FacturationRepository, NouvelleFacture } from "@/lib/ports/facturation-repository";

// Les 16 prestations du contrat passent par un seul chemin : tarif fige au contrat sinon
// bareme, majoration d'urgence sur le temps passe, jamais de facture a 0 (audit 16/09/2026).

const etat = vi.hoisted(() => ({
  tarifsContrat: undefined as Record<string, number> | undefined,
  bareme: {} as Record<string, number>,
  creees: [] as NouvelleFacture[],
}));

vi.mock("@/lib/services/coproprietes/exiger-perimetre", () => ({ exigerPerimetre: async () => undefined }));
vi.mock("@/lib/adapters/router", () => ({
  getFacturationRepository: () =>
    ({
      async getDernierContrat() {
        return { coproCode: "S001", debutContrat: "2026-07-01", ...(etat.tarifsContrat ? { tarifs: etat.tarifsContrat } : {}) };
      },
      async getTarifTtc(id: string) {
        return id in etat.bareme ? etat.bareme[id]! : null;
      },
      async creerFacture(input: NouvelleFacture) {
        etat.creees.push(input);
        return `facture-${etat.creees.length}`;
      },
      async getDonneesContrat() {
        return { lotsPrincipaux: 28 };
      },
    }) satisfies Partial<Record<keyof FacturationRepository, unknown>>,
}));

import { apercuPrestationContrat, contextePrestationContrat, creerFacturePrestationContrat } from "./creer-facture-prestation-contrat";

beforeEach(() => {
  etat.tarifsContrat = undefined;
  etat.bareme = { MED: 60, TauxHoraire: 100, AGE: 12 };
  etat.creees = [];
});

describe("creerFacturePrestationContrat", () => {
  it("prefere le tarif fige au contrat, et le trace dans les details", async () => {
    etat.tarifsContrat = { MED: 45 };
    const r = await creerFacturePrestationContrat({ coproCode: "S001", prestation: "mise_en_demeure", nomClient: "M. DUPONT" }, "m1");
    expect(r.factureId).toBe("facture-1");
    expect(r.montantHt).toBe(37.5);
    expect(etat.creees[0]).toMatchObject({
      typePrestation: "prestation_contrat",
      libelle: "Mise en demeure par lettre recommandée avec accusé de réception - M. DUPONT",
      details: { identifiantPrestation: "MED", tarifFige: true, tarifTtc: 45, anneeBareme: 2026, nomClient: "M. DUPONT" },
      lignes: [{ quantite: 1, prixUnitaireHt: 37.5 }],
    });
  });
  it("sinon le bareme de l'annee du contrat", async () => {
    await creerFacturePrestationContrat({ coproCode: "S001", prestation: "mise_en_demeure" }, "m1");
    expect(etat.creees[0]!.details).toMatchObject({ tarifFige: false, tarifTtc: 60 });
  });
  it("temps passe en urgence : +40 % sur le taux horaire, quantite arrondie a la demi-heure superieure", async () => {
    const r = await creerFacturePrestationContrat({ coproCode: "S001", prestation: "temps_passe", quantite: 2.2, urgence: true }, "m1");
    // 100 € TTC x 1,4 = 140 € TTC l'heure ; 2,2 h -> 2,5 h -> 350 € TTC = 291,67 € HT
    expect(etat.creees[0]!.details).toMatchObject({ majorationPct: 0.4, quantite: 2.5, montantTtc: 350 });
    expect(r.montantHt).toBeCloseTo(291.67, 2);
  });
  it("par lot : la quantite est portee par la ligne (« 28 x 10,00 € »)", async () => {
    await creerFacturePrestationContrat({ coproCode: "S001", prestation: "ag_supplementaire", quantite: 28 }, "m1");
    expect(etat.creees[0]!.lignes[0]).toMatchObject({ quantite: 28, prixUnitaireHt: 10 });
  });
  it("tarif a 0 : aucune facture creee ; prestation inconnue ou tarif absent : erreur", async () => {
    etat.bareme = { MED: 0 };
    expect(await creerFacturePrestationContrat({ coproCode: "S001", prestation: "mise_en_demeure" }, "m1")).toEqual({ montantHt: 0, factureId: null });
    expect(etat.creees).toHaveLength(0);
    await expect(creerFacturePrestationContrat({ coproCode: "S001", prestation: "nimporte" }, "m1")).rejects.toThrow(/Prestation inconnue/);
    await expect(creerFacturePrestationContrat({ coproCode: "S001", prestation: "hypotheque" }, "m1")).rejects.toThrow(/absent du bareme 2026/);
  });
  it("par lot sans quantite : erreur qui nomme l'unite attendue", async () => {
    await expect(creerFacturePrestationContrat({ coproCode: "S001", prestation: "ag_supplementaire" }, "m1")).rejects.toThrow(/indiquer le nombre de lot/);
  });
});

describe("apercu et contexte", () => {
  it("l'apercu dit le tarif applique et n'ecrit rien", async () => {
    etat.tarifsContrat = { MED: 45 };
    const a = await apercuPrestationContrat({ coproCode: "S001", prestation: "mise_en_demeure" }, "m1");
    expect(a.details.map((d) => d.libelle)).toContain("Tarif figé au contrat");
    expect(a.rienAFacturer).toBe(false);
    expect(etat.creees).toHaveLength(0);
  });
  it("le contexte rend les lots meme quand le tarif manque, et dit pourquoi", async () => {
    etat.bareme = {};
    const c = await contextePrestationContrat("S001", "mise_en_demeure", "m1");
    expect(c.lotsPrincipaux).toBe(28);
    expect(c.tarif).toBeNull();
    expect(c.erreurTarif).toMatch(/absent du bareme 2026/);
  });
});
