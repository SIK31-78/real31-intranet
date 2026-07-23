// Fix C (pas de facture a 0 EUR) cote suivi de travaux. Un forfait (ou un
// pourcentage) a 0 ne doit creer aucun brouillon : le chemin de creation refuse,
// comme le depassement CS et le sinistre.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NouvelleFacture } from "@/lib/ports/facturation-repository";

const etat = vi.hoisted(() => {
  const ref = {
    creees: [] as NouvelleFacture[],
    reset() {
      ref.creees = [];
    },
  };
  return ref;
});

vi.mock("@/lib/adapters/router", () => ({
  getFacturationRepository: () => ({
    async creerFacture(input: NouvelleFacture) {
      etat.creees.push(input);
      return `facture-${etat.creees.length}`;
    },
  }),
}));

import { creerFactureSuiviTravaux } from "@/lib/services/facturation/creer-facture-suivi-travaux";

beforeEach(() => {
  etat.reset();
});

describe("suivi travaux - montant a 0 (Fix C)", () => {
  it("forfait a 0 -> aucune facture creee, factureId null", async () => {
    const res = await creerFactureSuiviTravaux(
      { coproCode: "S001", libelleTravaux: "Ravalement", honoraires: { mode: "forfait", forfaitTtc: 0 } },
      "m1",
    );
    expect(res.factureId).toBeNull();
    expect(res.montantHt).toBe(0);
    expect(etat.creees).toHaveLength(0);
  });

  it("forfait positif -> facture creee normalement", async () => {
    const res = await creerFactureSuiviTravaux(
      { coproCode: "S001", libelleTravaux: "Ravalement", honoraires: { mode: "forfait", forfaitTtc: 1200 } },
      "m1",
    );
    expect(res.factureId).not.toBeNull();
    expect(etat.creees).toHaveLength(1);
  });
});
