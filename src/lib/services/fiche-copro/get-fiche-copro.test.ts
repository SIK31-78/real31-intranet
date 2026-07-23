// Tests de la lecture TRANSVERSE de la fiche copro (fix du 404 comptable) : avec
// { transverse: true } (pole comptable / super-admin), la copro est lue SANS le scope
// managerId -> la fiche s'ouvre sur n'importe quelle copro ; sans le flag, le
// cloisonnement gestionnaire est inchange (hors perimetre -> null -> notFound / 404).
// Router et services composes sont mockes : on ne teste ICI que la resolution du scope.

import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => {
  const ref = {
    // La copro "S024" est geree par g1. findByCode simule le scope de l'adapter :
    // sans managerId -> trouvee ; avec managerId -> trouvee seulement si c'est g1.
    appels: [] as { code: string; managerId?: string }[],
    reset() {
      ref.appels.length = 0;
    },
  };
  return ref;
});

vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () => ({
    async findByCode(code: string, managerId?: string) {
      etat.appels.push({ code, ...(managerId !== undefined ? { managerId } : {}) });
      if (code !== "S024") return null;
      if (managerId !== undefined && managerId !== "g1") return null; // hors scope
      return {
        code: "S024",
        source: "crypto",
        nom: "Résidence Test",
        adresse: { ligne1: "1 rue Test", codePostal: "31000", ville: "Toulouse" },
        statut: "active",
        lotsPrincipaux: 10,
        lotsAutres: 0,
        exercice: { debut: "01/01", fin: "31/12" },
        priseEnGestion: "mars 2018",
        equipe: [],
      };
    },
  }),
  getJalonRepository: () => ({
    async getJalons() {
      return [];
    },
  }),
  getGestionnaireRepository: () => ({
    async list() {
      return [];
    },
  }),
}));
vi.mock("@/lib/services/estale/donnees-copro-estale", () => ({
  donneesCoproEstale: async () => null,
}));
vi.mock("@/lib/services/coproprietes/confirmation-evenement", () => ({
  getConfirmations: async () => [],
}));
vi.mock("@/lib/services/calendrier/get-calendrier", () => ({
  // La fiche derive desormais les prochains evenements localement (pure) au lieu de recharger
  // tout le portefeuille : la copro de test n'a pas de dates -> aucun evenement.
  evenementsDeCopro: () => [],
}));
vi.mock("@/lib/services/compta/get-compta", () => ({
  getEtatCompta: async () => ({ comptesVerifies: false, envoyerAvant: false, checks: {}, notes: [] }),
}));

import { getFicheCopro } from "@/lib/services/fiche-copro/get-fiche-copro";

const TODAY = "2026-07-15";

beforeEach(() => {
  etat.reset();
});

describe("getFicheCopro - scope de lecture", () => {
  it("gestionnaire DE la copro : fiche resolue (cloisonnement inchange)", async () => {
    const fiche = await getFicheCopro("S024", "g1", TODAY);
    expect(fiche?.copro.code).toBe("S024");
    expect(etat.appels[0]).toEqual({ code: "S024", managerId: "g1" });
  });

  it("gestionnaire HORS perimetre, sans transverse : null (-> notFound / 404)", async () => {
    const fiche = await getFicheCopro("S024", "g2", TODAY);
    expect(fiche).toBeNull();
    expect(etat.appels[0]).toEqual({ code: "S024", managerId: "g2" });
  });

  it("comptable (transverse) : la fiche s'ouvre sur une copro qui n'est PAS la sienne", async () => {
    const fiche = await getFicheCopro("S024", "g2", TODAY, { transverse: true });
    expect(fiche?.copro.code).toBe("S024");
    // La lecture transverse interroge SANS scope managerId.
    expect(etat.appels[0]).toEqual({ code: "S024" });
  });

  it("copro inconnue : null meme en transverse (pas d'invention)", async () => {
    const fiche = await getFicheCopro("S999", "g2", TODAY, { transverse: true });
    expect(fiche).toBeNull();
  });
});
