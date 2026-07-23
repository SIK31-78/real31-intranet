// Fix C (pas de facture a 0 EUR) cote prestations forfaitaires (pre-etat date /
// etat date, montant negociable). Le payload Pennylane ne refuse qu'une facture
// SANS ligne, pas une ligne a 0 EUR : le chemin de CREATION doit donc refuser un
// montant negocie a 0 et ne creer aucun brouillon (comme le depassement CS).

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
    async getDernierContrat() {
      return { id: "c1", coproCode: "S001", debutContrat: "2026-01-01" };
    },
    async getTarifTtc() {
      return 360; // tarif du bareme (sert de defaut, ici on negocie)
    },
    async creerFacture(input: NouvelleFacture) {
      etat.creees.push(input);
      return `facture-${etat.creees.length}`;
    },
  }),
}));

import {
  creerFacturePreEtatDate,
} from "@/lib/services/facturation/creer-facture-prestation-forfaitaire";

beforeEach(() => {
  etat.reset();
});

describe("prestation forfaitaire - montant a 0 (Fix C)", () => {
  it("montant negocie a 0 -> aucune facture creee, factureId null", async () => {
    const res = await creerFacturePreEtatDate(
      { coproCode: "S001", montantTtcNegocie: 0 },
      "m1",
    );
    expect(res.factureId).toBeNull();
    expect(res.montantHt).toBe(0);
    expect(etat.creees).toHaveLength(0); // aucun brouillon Pennylane a 0 EUR
  });

  it("montant positif -> facture creee normalement", async () => {
    const res = await creerFacturePreEtatDate(
      { coproCode: "S001", montantTtcNegocie: 360 },
      "m1",
    );
    expect(res.factureId).not.toBeNull();
    expect(etat.creees).toHaveLength(1);
  });
});
