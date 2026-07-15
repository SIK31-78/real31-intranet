// Tests de la cascade destinataires du conseil syndical (increment 2 "dates CS/AG") :
// eStale (owner.email) d'abord, sinon liste de diffusion Crypto, sinon vide. eStale et le
// provider Crypto sont MOCKES (aucun reseau). Adresses inventees @example.test (pas de PII).

import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({
  estale: null as { conseilSyndical: { nomComplet: string; role: string; email?: string }[] } | null,
  estaleThrow: false,
  liste: null as { coproCode: string; designation: string; emails: string[] } | null,
  reset() {
    etat.estale = null;
    etat.estaleThrow = false;
    etat.liste = null;
  },
}));

vi.mock("@/lib/services/estale/donnees-copro-estale", () => ({
  async donneesCoproEstale() {
    if (etat.estaleThrow) throw new Error("eStale indisponible");
    return etat.estale;
  },
}));

vi.mock("@/lib/adapters/router", () => ({
  getListesDiffusionProvider: () => ({
    async listeCSPourCopro() {
      return etat.liste;
    },
  }),
}));

import { destinatairesConseilSyndical } from "./destinataires-conseil";

beforeEach(() => etat.reset());

describe("destinatairesConseilSyndical", () => {
  it("source eStale : utilise les emails des membres du conseil (dedupliques)", async () => {
    etat.estale = {
      conseilSyndical: [
        { nomComplet: "Mme A", role: "president", email: "a@example.test" },
        { nomComplet: "M. B", role: "membre", email: "b@example.test" },
        { nomComplet: "Mme C", role: "membre" }, // sans email -> ignore
        { nomComplet: "M. D", role: "membre", email: "A@example.test" }, // doublon casse
      ],
    };
    // Une liste Crypto existe aussi, mais eStale prime.
    etat.liste = { coproCode: "S46", designation: "CS", emails: ["z@example.test"] };
    const r = await destinatairesConseilSyndical("S46");
    expect(r.source).toBe("estale");
    expect(r.emails).toEqual(["a@example.test", "b@example.test"]);
  });

  it("eStale sans email : bascule sur la liste de diffusion Crypto", async () => {
    etat.estale = {
      conseilSyndical: [{ nomComplet: "Mme A", role: "president" }],
    };
    etat.liste = { coproCode: "S46", designation: "CS - S46", emails: ["m1@example.test", "m2@example.test"] };
    const r = await destinatairesConseilSyndical("S46");
    expect(r.source).toBe("crypto");
    expect(r.emails).toEqual(["m1@example.test", "m2@example.test"]);
  });

  it("eStale en panne : ne crashe pas, bascule sur Crypto", async () => {
    etat.estaleThrow = true;
    etat.liste = { coproCode: "S46", designation: "CS", emails: ["m1@example.test"] };
    const r = await destinatairesConseilSyndical("S46");
    expect(r.source).toBe("crypto");
    expect(r.emails).toEqual(["m1@example.test"]);
  });

  it("aucune source : renvoie vide (saisie manuelle, jamais de devinette)", async () => {
    const r = await destinatairesConseilSyndical("S999");
    expect(r.source).toBe("aucune");
    expect(r.emails).toEqual([]);
  });
});
