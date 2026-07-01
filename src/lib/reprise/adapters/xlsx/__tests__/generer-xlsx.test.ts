import { afterAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";
import { genererPhaseA, slug, verifierTemplatesAJour } from "../generer-xlsx";
import { HEADERS_LOTS, HEADERS_OWNERS } from "../colonnes-estale";

const templatesDir = join(process.cwd(), "src/lib/reprise/templates");
const outDir = mkdtempSync(join(tmpdir(), "reprise-xlsx-"));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

function jeu(): JeuDeDonnees {
  return {
    lots: [
      { numero: 1, type: "Appartement", usage: "residential", etage: 1, surface: 45, nbPiece: 2, commentaire: "T2 1er" },
      { numero: 2, type: "Parking", usage: "parking", etage: -1, commentaire: "Parking SS" },
    ],
    cles: [{ code: "001", libelle: "Charges générales", totalAttendu: 1000, defaut: true }],
    tantiemes: [
      { cleCode: "001", lot: 1, valeur: 600 },
      { cleCode: "001", lot: 2, valeur: 400 },
    ],
    owners: [
      { id: "o1", civilite: "m", nom: "DUPONT", prenom: "Jean", pro: false },
      { id: "o2", civilite: "indivision", nom: "MARTIN", prenom: "Claire", pro: false },
    ],
    attributions: [
      { ownerId: "o1", lot: 1 },
      { ownerId: "o2", lot: 2 },
    ],
  };
}

async function lire(fichier: string): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(join(outDir, fichier));
  return wb.worksheets[0]!;
}

describe("genererPhaseA (clone des templates eStale reels)", () => {
  it(
    "les templates eStale reels correspondent toujours a notre spec (pas de derive)",
    async () => {
      const ecarts = await verifierTemplatesAJour(templatesDir);
      expect(ecarts, ecarts.join(" | ")).toEqual([]);
    },
    30000, // lecture exceljs de 4 templates a grande dimension : garde-fou de dev, pas un chemin chaud
  );

  it("genere lots + tantiemes(1/cle) + owners + links_DRAFT", async () => {
    const fichiers = await genererPhaseA(jeu(), { outDir });
    const types = fichiers.map((f) => f.type);
    expect(types).toEqual(["lots", "tantiemes", "owners", "links_draft"]);
  });

  it("lots.xlsx : en-tete intacte + lignes data", async () => {
    const ws = await lire("lots.xlsx");
    HEADERS_LOTS.forEach((h, i) => expect(String(ws.getRow(1).getCell(i + 1).value)).toBe(h));
    expect(ws.getRow(2).getCell(1).value).toBe(1);
    expect(ws.getRow(2).getCell(3).value).toBe("residential");
    expect(ws.getRow(3).getCell(3).value).toBe("parking");
    expect(ws.getRow(3).getCell(5).value).toBe(-1); // etage sous-sol
  });

  it("owners.xlsx : 22 colonnes, civilite/nom/Pro corrects", async () => {
    const ws = await lire("owners.xlsx");
    HEADERS_OWNERS.forEach((h, i) => expect(String(ws.getRow(1).getCell(i + 1).value)).toBe(h));
    expect(ws.getRow(2).getCell(1).value).toBe("Non"); // Pro
    expect(ws.getRow(2).getCell(6).value).toBe("m"); // Civilité
    expect(ws.getRow(2).getCell(7).value).toBe("DUPONT"); // Nom
    expect(ws.getRow(3).getCell(6).value).toBe("indivision");
    expect(ws.getRow(2).getCell(21).value).toBe("France"); // Adr. Pays par defaut
  });

  it("tantiemes : un fichier par cle, lots omis si 0", async () => {
    const ws = await lire(`tantiemes_001_${slug("Charges générales")}.xlsx`);
    expect(String(ws.getRow(1).getCell(1).value)).toBe("N° Lot");
    expect(ws.getRow(2).getCell(2).value).toBe(600);
    expect(ws.getRow(3).getCell(2).value).toBe(400);
  });

  it("links_DRAFT : col A = NOM en clair (temporaire)", async () => {
    const ws = await lire("links_DRAFT.xlsx");
    expect(ws.getRow(2).getCell(1).value).toBe("DUPONT Jean");
    expect(ws.getRow(2).getCell(2).value).toBe(1);
  });
});
