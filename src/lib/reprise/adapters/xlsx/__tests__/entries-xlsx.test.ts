// Tests de la generation + relecture d'entries.xlsx : propriete ALLER-RETOUR (ce que la
// generation ecrit, la relecture le reconstitue), cellules texte (Date/Compte/Cle) et
// erreurs de relecture par ligne. Donnees synthetiques.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { LigneEntry } from "@/lib/reprise/domain/entries";
import { genererEntriesBuffer, parserEntries } from "../entries-xlsx";
import { FEUILLES, HEADERS_ENTRIES } from "../colonnes-estale";

const LIGNES: LigneEntry[] = [
  {
    date: "01/01/2025",
    libelle: "Report a nouveau (reprise)",
    journal: "carryforward",
    compte: "4500001",
    cle: "100",
    type: "debit",
    montantTTC: 80,
    commentaire: "Report a-nouveau repris - compte source 4501.100",
  },
  {
    date: "05/03/2025",
    libelle: "Electricite",
    piece: "F-2025-042",
    journal: "carryforward",
    compte: "6060000",
    cle: "001",
    type: "debit",
    montantTTC: 120,
    tva: 20,
    deductible: 20,
    recuperable: 5,
  },
  {
    date: "01/03/2025",
    libelle: "Virement",
    journal: "carryforward",
    compte: "4719999",
    cle: "001",
    type: "credit",
    montantTTC: 100.5,
    commentaire: "Compte source 5120.000",
  },
];

describe("aller-retour generer -> parser entries.xlsx", () => {
  it("reconstitue exactement les lignes ecrites", async () => {
    const buffer = await genererEntriesBuffer(LIGNES);
    const r = await parserEntries(buffer);
    expect(r.erreurs).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.lignes).toEqual(LIGNES);
  });

  it("ecrit la feuille « Écritures » avec les en-tetes exacts du template et Date/Compte/Cle en TEXTE", async () => {
    const buffer = await genererEntriesBuffer(LIGNES);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer.slice().buffer as ArrayBuffer);
    const ws = wb.getWorksheet(FEUILLES.entries)!;
    expect(ws).toBeDefined();
    HEADERS_ENTRIES.forEach((h, i) => {
      expect(String(ws.getRow(1).getCell(i + 1).value)).toBe(h);
    });
    // LA regle de format : la date reste une CHAINE (jamais un nombre de jours Excel).
    expect(typeof ws.getRow(2).getCell(1).value).toBe("string");
    expect(ws.getRow(2).getCell(1).numFmt).toBe("@");
    expect(ws.getRow(2).getCell(6).numFmt).toBe("@"); // cle "100" jamais convertie en nombre
    // Les montants restent des NOMBRES (sans symbole euro).
    expect(typeof ws.getRow(2).getCell(8).value).toBe("number");
  });
});

describe("relecture d'un fichier casse", () => {
  async function xlsxBrut(lignes: (string | number | null)[][]): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(FEUILLES.entries);
    ws.addRow([...HEADERS_ENTRIES]);
    for (const l of lignes) ws.addRow(l);
    const buf = await wb.xlsx.writeBuffer();
    return new Uint8Array(buf as ArrayBuffer);
  }

  it("Type hors debit|credit -> erreur par ligne", async () => {
    const r = await parserEntries(await xlsxBrut([["01/01/2025", "x", "", "", "4500001", "001", "DEBIT!", 10, "", "", "", ""]]));
    expect(r.ok).toBe(false);
    expect(r.erreurs.some((e) => /Type/.test(e) && /ligne 2/.test(e))).toBe(true);
  });

  it("Journal hors liste eStale -> erreur", async () => {
    const r = await parserEntries(await xlsxBrut([["01/01/2025", "x", "", "journal-invente", "4500001", "001", "debit", 10, "", "", "", ""]]));
    expect(r.ok).toBe(false);
    expect(r.erreurs.some((e) => /Journal/.test(e))).toBe(true);
  });

  it("Montant TTC illisible -> erreur", async () => {
    const r = await parserEntries(await xlsxBrut([["01/01/2025", "x", "", "", "4500001", "001", "debit", "abc", "", "", "", ""]]));
    expect(r.ok).toBe(false);
    expect(r.erreurs.some((e) => /Montant TTC/.test(e))).toBe(true);
  });

  it("en-tetes qui ne suivent pas le template -> refus global", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(FEUILLES.entries);
    ws.addRow(["Date", "Libellé"]);
    const buf = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    const r = await parserEntries(buf);
    expect(r.ok).toBe(false);
    expect(r.lignes).toEqual([]);
  });
});
