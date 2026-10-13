import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockTriRepository } from "@/lib/adapters/mock/mock-tri-repository";

// Service : « mes mails » sur la boîte partagée = les rangements du tri vers MES binômes.
const etat = vi.hoisted(() => ({ repo: null as unknown as MockTriRepository }));
vi.mock("@/lib/adapters/router", () => ({ getTriRepository: () => etat.repo }));

const { distributionDe } = await import("@/lib/services/mes-emails/boites-visibles");

const BOITE = "syndic4@real31.fr";
const ranger = (imid: string, dossierCle: string, copro: string | null) =>
  etat.repo.journaliser({
    boite: BOITE,
    internetMessageId: imid,
    messageId: imid,
    expediteur: "client@x.fr",
    objet: "objet",
    coproReference: copro,
    copros: copro ? [copro] : [],
    dossierNom: "SK-CP",
    dossierCle,
    signal: null,
    candidats: [],
    simulation: true,
    par: "mylene@real31.fr",
  });

describe("distributionDe", () => {
  beforeEach(() => {
    etat.repo = new MockTriRepository({
      binomes: [{ id: "b1", gestionnaireEmail: "sophie@real31.fr", assistant: { nomComplet: "Clara", email: "clara@real31.fr" }, principal: true }],
      parCopro: {},
    });
  });

  it("donne au gestionnaire ET à son assistante les mails rangés vers leur binôme, avec la copro du tri", async () => {
    await ranger("<a>", "binome:sophie@real31.fr", "S247");
    await ranger("<b>", "binome:sophie@real31.fr", null);
    for (const qui of ["sophie@real31.fr", "Clara@real31.fr"]) {
      const d = await distributionDe({ email: qui }, BOITE);
      expect([...d.entries()].sort()).toEqual([["<a>", "S247"], ["<b>", null]]);
    }
  });

  it("exclut la corbeille, la compta, les autres binômes et les autres boîtes", async () => {
    await ranger("<c>", "corbeille", null);
    await ranger("<d>", "comptabilite", null);
    await ranger("<e>", "binome:marc@real31.fr", "S300");
    expect((await distributionDe({ email: "sophie@real31.fr" }, BOITE)).size).toBe(0);
    expect((await distributionDe({ email: "sophie@real31.fr" }, "syndic2@real31.fr")).size).toBe(0);
  });
});
