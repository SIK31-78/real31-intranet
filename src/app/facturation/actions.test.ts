import { beforeEach, describe, expect, it, vi } from "vitest";

// Rejouer une facture = une emission REELLE chez Pennylane : l'action doit respecter le
// perimetre de l'appelant (audit du 16/09/2026 : seule action de facturation qui l'oubliait).

const etat = vi.hoisted(() => ({
  coproDeFacture: "S215" as string | null,
  perimetreRefuse: false,
  remises: 0,
  emissions: 0,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/session", () => ({
  getGestionnaireCourant: async () => ({ id: "u1", initiales: "RB", nomComplet: "Rémi BARD", email: "remi@real31.fr" }),
}));
vi.mock("@/lib/services/coproprietes/exiger-perimetre", () => ({
  exigerPerimetre: async () => {
    if (etat.perimetreRefuse) throw new Error("Copropriété hors du périmètre du gestionnaire.");
  },
}));
vi.mock("@/lib/adapters/router", () => ({
  getFacturationRepository: () => ({
    coproDeFacture: async () => etat.coproDeFacture,
    remettreEnAttente: async () => {
      etat.remises++;
    },
  }),
}));
vi.mock("@/lib/services/facturation/emettre-factures-en-attente", () => ({
  emettreFacturesEnAttente: async () => {
    etat.emissions++;
    return { emises: 1, enErreur: 0, erreurs: [] };
  },
}));
vi.mock("@/lib/services/facturation/creer-facture-prestation-contrat", () => ({}));
vi.mock("@/lib/services/facturation/creer-facture-depassement-cs", () => ({}));
vi.mock("@/lib/services/facturation/creer-facture-suivi-travaux", () => ({}));
vi.mock("@/lib/services/facturation/creer-facture-suivi-sinistre", () => ({}));
vi.mock("@/lib/services/facturation/creer-facture-prestation-forfaitaire", () => ({}));

import { rejouerFactureAction } from "./actions";

const ID = "0b1f6a3e-9c2d-4e7a-8f10-2a3b4c5d6e7f";

beforeEach(() => {
  etat.coproDeFacture = "S215";
  etat.perimetreRefuse = false;
  etat.remises = 0;
  etat.emissions = 0;
});

describe("rejouerFactureAction", () => {
  it("dans le perimetre : remet en attente puis emet", async () => {
    const r = await rejouerFactureAction(ID);
    expect(r.ok).toBe(true);
    expect(etat.remises).toBe(1);
    expect(etat.emissions).toBe(1);
  });
  it("hors perimetre : rien n'est remis en attente, rien n'est emis", async () => {
    etat.perimetreRefuse = true;
    const r = await rejouerFactureAction(ID);
    expect(r).toEqual({ ok: false, erreur: "Copropriété hors du périmètre du gestionnaire." });
    expect(etat.remises).toBe(0);
    expect(etat.emissions).toBe(0);
  });
  it("facture inconnue ou identifiant qui n'est pas un uuid : refus", async () => {
    etat.coproDeFacture = null;
    expect((await rejouerFactureAction(ID)).ok).toBe(false);
    expect((await rejouerFactureAction("abc")).ok).toBe(false);
    expect(etat.emissions).toBe(0);
  });
});
