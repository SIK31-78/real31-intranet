import { describe, expect, it } from "vitest";
import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";
import { MockExtractionProvider } from "@/lib/reprise/adapters/extraction/mock-extraction-provider";
import { analyserPatrimoine } from "../orchestrateur-patrimoine";
import { onboarderCopro, type MetadonneesCopro } from "../onboarder-copro";
import { DryRunEstaleEcritureProvider } from "@/lib/reprise/adapters/estale-ecriture/dry-run-provider";

const META: MetadonneesCopro = {
  name: "Residence Foch",
  reference: "S0999",
  management: "CONDO",
  establishmentID: "153e3cc2-7158-4bbe-abef-b2cd815b2742",
  address: { postcode: "31000", city: "Toulouse", country: "France" },
};

async function jeuMock(): Promise<JeuDeDonnees> {
  const { jeu } = await analyserPatrimoine(new MockExtractionProvider(), []);
  return jeu;
}

describe("onboarderCopro (dry-run)", () => {
  it("cree la copro D'ABORD puis injecte le patrimoine dedans", async () => {
    const jeu = await jeuMock();
    const provider = new DryRunEstaleEcritureProvider();

    const r = await onboarderCopro(provider, jeu, { metadonnees: META });

    expect(r.succes).toBe(true);
    expect(r.coproCreee).toBe(true);
    expect(r.condoID).toBe("condo#dry");
    // Le condoID cree est bien celui utilise par l'injection.
    expect(r.injection.condoID).toBe("condo#dry");

    // La copro est le TOUT PREMIER appel du journal (avant les lots).
    expect(provider.journal[0]!.type).toBe("creerCopro");
    const creerCopro = provider.journal.filter((e) => e.type === "creerCopro");
    expect(creerCopro).toHaveLength(1);
    // Les lots injectes pointent tous sur le condoID cree.
    const lots = provider.journal.filter((e) => e.type === "creerLot");
    for (const l of lots) expect(l.condoID).toBe("condo#dry");
  });

  it("saute createCondo si un condoID est deja fourni", async () => {
    const jeu = await jeuMock();
    const provider = new DryRunEstaleEcritureProvider();

    const r = await onboarderCopro(provider, jeu, { condoID: "condo-existant" });

    expect(r.coproCreee).toBe(false);
    expect(r.condoID).toBe("condo-existant");
    expect(provider.journal.filter((e) => e.type === "creerCopro")).toHaveLength(0);
    expect(r.injection.condoID).toBe("condo-existant");
  });

  it("si createCondo echoue : rapport en echec, AUCUNE injection", async () => {
    const jeu = await jeuMock();
    const provider = new DryRunEstaleEcritureProvider();
    const casse = Object.assign(Object.create(Object.getPrototypeOf(provider)), provider, {
      creerCopro: async () => {
        throw new Error("boom createCondo");
      },
    });

    const r = await onboarderCopro(casse, jeu, { metadonnees: META });

    expect(r.succes).toBe(false);
    expect(r.coproCreee).toBe(false);
    expect(r.erreurCreation).toMatch(/boom createCondo/);
    expect(r.injection.compteurs.lots).toBe(0);
  });
});
