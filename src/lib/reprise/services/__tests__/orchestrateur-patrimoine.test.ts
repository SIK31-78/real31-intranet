import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockExtractionProvider } from "@/lib/reprise/adapters/extraction/mock-extraction-provider";
import { analyserPatrimoine, produirePhaseA } from "../orchestrateur-patrimoine";

const outDir = mkdtempSync(join(tmpdir(), "reprise-orch-"));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe("analyserPatrimoine (mock)", () => {
  it("assemble le jeu et calcule le recap GO/STOP", async () => {
    const { jeu, recap } = await analyserPatrimoine(new MockExtractionProvider(), []);

    expect(jeu.lots).toHaveLength(3);
    expect(recap.lots.parUsage.residential).toBe(2);
    expect(recap.lots.parUsage.parking).toBe(1);

    expect(recap.cles).toHaveLength(1);
    expect(recap.cles[0]!.ecart).toBe(0);

    expect(recap.owners.total).toBe(3);
    expect(recap.owners.sci).toBe(1);
    expect(recap.owners.couples).toBe(1);

    expect(recap.attributions.lotsOrphelins).toBe(0);
    expect(recap.notes.length).toBeGreaterThanOrEqual(2);
    expect(recap.pretAProduire).toBe(true);
    expect(recap.checks.ok).toBe(true);
  });

  it("signale pretAProduire=false quand une cle a un ecart", async () => {
    const provider = new MockExtractionProvider(
      {
        lots: [{ numero: 1, type: "Appartement", usage: "residential", commentaire: "x" }],
        cles: [{ code: "001", libelle: "Charges générales", totalAttendu: 1000 }],
        tantiemes: [{ cleCode: "001", lot: 1, valeur: 999 }], // ecart -1
        notes: [],
      },
      {
        owners: [{ id: "o1", civilite: "m", nom: "DUPONT", prenom: "Jean", pro: false }],
        attributions: [{ ownerId: "o1", lot: 1 }],
        notes: [],
      },
    );
    const { recap } = await analyserPatrimoine(provider, []);
    expect(recap.pretAProduire).toBe(false);
    expect(recap.checks.erreurs.some((e) => e.code === "TANT_ECART_TOTAL")).toBe(true);
  });
});

describe("produirePhaseA", () => {
  it("genere les fichiers quand le jeu est valide (apres GO)", async () => {
    const { jeu } = await analyserPatrimoine(new MockExtractionProvider(), []);
    const fichiers = await produirePhaseA(jeu, { outDir });
    expect(fichiers.map((f) => f.type)).toEqual(["lots", "tantiemes", "owners", "links_draft"]);
  });

  it("REFUSE de produire si une erreur bloquante subsiste", async () => {
    const { jeu } = await analyserPatrimoine(new MockExtractionProvider(), []);
    jeu.tantiemes[0]!.valeur = 1; // casse le total de la cle 001
    await expect(produirePhaseA(jeu, { outDir })).rejects.toThrow(/Production refusee/);
  });
});
