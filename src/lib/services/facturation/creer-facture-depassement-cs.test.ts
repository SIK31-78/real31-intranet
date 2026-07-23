// Fix A (fail-loud) cote depassement CS : une franchise NON renseignee (NULL) sur
// la fiche copro doit LEVER une erreur actionnable plutot que d'etre traitee comme
// 0 (ce qui ferait facturer toute la reunion). Un 0 EXPLICITE reste valide.
// Le repo de facturation (routeur) est mocke : on pilote la valeur de la franchise.

import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => {
  const ref = {
    franchiseCsHeures: null as number | null,
    reset() {
      ref.franchiseCsHeures = null;
    },
  };
  return ref;
});

vi.mock("@/lib/adapters/router", () => ({
  getFacturationRepository: () => ({
    async getParametresCopro() {
      return {
        franchiseCsHeures: etat.franchiseCsHeures,
        dureeAgHeures: 2,
        debutMinAgHeure: 10,
        finMaxAgHeure: 20,
      };
    },
    async getDernierContrat() {
      return { id: "c1", coproCode: "S001", debutContrat: "2026-01-01" };
    },
    async getTarifTtc() {
      return 120; // TauxHoraire TTC
    },
  }),
}));

import {
  apercuDepassementCs,
  creerFactureDepassementCs,
} from "@/lib/services/facturation/creer-facture-depassement-cs";

// Reunion de 2 h (arrondie a 2 h) : au-dela de toute franchise <= 2 h.
const reunion = {
  jourDebut: "2026-06-10",
  heureDebut: 18,
  minuteDebut: 0,
  jourFin: "2026-06-10",
  heureFin: 20,
  minuteFin: 0,
};

beforeEach(() => {
  etat.reset();
});

describe("depassement CS - franchise NON renseignee (Fix A)", () => {
  it("apercu : franchise NULL -> leve une erreur actionnable nommant la copro", async () => {
    etat.franchiseCsHeures = null;
    await expect(apercuDepassementCs({ coproCode: "S001", reunion }, "m1")).rejects.toThrow(
      /Franchise CS non renseignée pour la copropriété S001/,
    );
  });

  it("creation : franchise NULL -> refuse de facturer (leve avant toute ecriture)", async () => {
    etat.franchiseCsHeures = null;
    await expect(
      creerFactureDepassementCs({ coproCode: "S001", reunion }, "m1"),
    ).rejects.toThrow(/à compléter sur la fiche avant de facturer/);
  });

  it("franchise 0 EXPLICITE reste valide : 0 n'est pas confondu avec absent", async () => {
    etat.franchiseCsHeures = 0;
    const apercu = await apercuDepassementCs({ coproCode: "S001", reunion }, "m1");
    // 2 h - 0 franchise = 2 h facturables : ce n'est PAS "rien a facturer".
    expect(apercu.rienAFacturer).toBe(false);
    expect(apercu.montantHt).toBeGreaterThan(0);
  });
});
