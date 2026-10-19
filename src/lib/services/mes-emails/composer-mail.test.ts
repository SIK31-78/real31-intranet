import { beforeEach, describe, expect, it, vi } from "vitest";

// Contacts du compositeur (REA-356, 19/10/2026) : pour une copro ESTALE, les copropriétaires
// viennent d'ESTALE ; ESTALE en panne, on retombe sur l'annuaire Crypto.

const etat = vi.hoisted(() => ({
  proprietaires: null as { id: string; nom: string; email: string }[] | null,
  panneEstale: false,
  referenceDemandee: "",
}));

vi.mock("@/lib/services/estale/donnees-copro-estale", () => ({
  async donneesCoproEstale() {
    return { conseilSyndical: [{ nomComplet: "Mme PRÉSIDENTE", email: "presidente@x.fr" }] };
  },
}));
vi.mock("@/lib/adapters/router", () => ({
  getContactsCoproProvider: () => ({
    async listerParCopro() {
      return [
        { email: "ancien@x.fr", nom: "ANCIEN", qualite: "coproprietaire", personne: "crypto:1" },
        { email: "loc@x.fr", nom: "LOCATAIRE", qualite: "locataire" },
      ];
    },
  }),
  getCoproprietairesEstaleProvider: () => ({
    async listerJoignables(reference: string) {
      etat.referenceDemandee = reference;
      if (etat.panneEstale) throw new Error("ESTALE HTTP 503");
      return etat.proprietaires;
    },
  }),
}));

const { listerContactsComposition } = await import("./composer-mail");

describe("listerContactsComposition", () => {
  beforeEach(() => {
    etat.proprietaires = null;
    etat.panneEstale = false;
  });

  it("copro ESTALE : les copropriétaires d'ESTALE remplacent ceux de Crypto", async () => {
    etat.proprietaires = [{ id: "o1", nom: "M. ACTUEL", email: "actuel@x.fr" }];
    const r = await listerContactsComposition("S0178");
    expect(etat.referenceDemandee).toBe("S178");
    expect(r.map((c) => [c.email, c.qualite])).toEqual([
      ["loc@x.fr", "locataire"],
      ["actuel@x.fr", "coproprietaire"],
      ["presidente@x.fr", "conseil_syndical"],
    ]);
  });

  it("copro hors ESTALE : l'annuaire Crypto, complété du conseil syndical", async () => {
    const r = await listerContactsComposition("S178");
    expect(r.map((c) => c.email)).toEqual(["ancien@x.fr", "loc@x.fr", "presidente@x.fr"]);
  });

  it("ESTALE en panne : repli sur l'annuaire Crypto, noté dans les logs", async () => {
    etat.panneEstale = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = await listerContactsComposition("S178");
    expect(r.map((c) => c.email)).toContain("ancien@x.fr");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("repli sur l'annuaire Crypto"), "ESTALE HTTP 503");
    warn.mockRestore();
  });
});
