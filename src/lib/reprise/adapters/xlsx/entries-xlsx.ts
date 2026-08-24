// Generation ET relecture du fichier entries.xlsx (feuille « Écritures », template eStale).
//
// Meme philosophie que generer-xlsx/parser-xlsx : classeur NEUF avec le nom de feuille et
// les en-tetes EXACTS du template (colonnes-estale.ts) ; ce que la generation ecrit, le
// parseur sait le relire (propriete aller-retour testee).
//
// LA REGLE DE FORMAT QUI CASSE LES IMPORTS : Date, Compte et Cle partent en cellules TEXTE
// (une date convertie par Excel en nombre de jours depuis 1900 bloque l'import ; un code de
// cle "001" converti en nombre 1 aussi). Les montants restent des NOMBRES sans symbole EUR.
//
// La relecture sert la batterie d'auto-checks : R10, on ne croit pas la structure en
// memoire, on croit LE FICHIER RELU.

import ExcelJS from "exceljs";
import {
  JOURNAUX_ENTRIES,
  type JournalEntry,
  type LigneEntry,
} from "@/lib/reprise/domain/entries";
import { FEUILLES, HEADERS_ENTRIES } from "./colonnes-estale";

/** Construit le classeur entries.xlsx (feuille « Écritures » + en-tetes + lignes). */
function construireClasseur(lignes: LigneEntry[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(FEUILLES.entries);
  ws.addRow([...HEADERS_ENTRIES]);
  for (const l of lignes) {
    const row = ws.addRow([
      l.date, // texte (JJ/MM/AAAA)
      l.libelle,
      l.piece ?? "",
      l.journal ?? "",
      l.compte, // texte (nomenclature)
      l.cle ?? "",
      l.type,
      l.montantTTC,
      l.tva ?? "",
      l.deductible ?? "",
      l.recuperable ?? "",
      l.commentaire ?? "",
    ]);
    // Cellules TEXTE explicites (A, E, F) : jamais de conversion date/nombre par Excel.
    row.getCell(1).numFmt = "@";
    row.getCell(5).numFmt = "@";
    row.getCell(6).numFmt = "@";
  }
  return wb;
}

/** Genere entries.xlsx en buffer memoire (telechargement UI / relecture par les checks). */
export async function genererEntriesBuffer(lignes: LigneEntry[]): Promise<Uint8Array> {
  const buf = await construireClasseur(lignes).xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

/** Genere entries.xlsx sur disque (usage scripts / tests golden). */
export async function genererEntriesFichier(lignes: LigneEntry[], chemin: string): Promise<void> {
  await construireClasseur(lignes).xlsx.writeFile(chemin);
}

// --- Relecture -------------------------------------------------------------------

export interface ResultatParseEntries {
  lignes: LigneEntry[];
  /** Erreurs structurelles (feuille/en-tetes) ET valeurs illisibles, par ligne. */
  erreurs: string[];
  ok: boolean;
}

type Cellule = ExcelJS.CellValue;

function texte(v: Cellule): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (v instanceof Date) {
    const jj = String(v.getUTCDate()).padStart(2, "0");
    const mm = String(v.getUTCMonth() + 1).padStart(2, "0");
    return `${jj}/${mm}/${v.getUTCFullYear()}`;
  }
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("result" in v) return texte(v.result as Cellule);
    if ("text" in v) return String((v as { text: unknown }).text).trim();
  }
  return String(v).trim();
}

function nombre(v: Cellule): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number") return v;
  const t = texte(v).replace(/\s/g, "").replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Relit un entries.xlsx depuis ses octets. Verifie feuille + en-tetes exacts, puis chaque
 * ligne : les erreurs sont collectees (jamais de ligne ecartee en silence). C'est l'entree
 * de la batterie d'auto-checks (executee sur le fichier RELU, jamais la structure en memoire).
 */
export async function parserEntries(contenu: Uint8Array): Promise<ResultatParseEntries> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(contenu.slice().buffer as ArrayBuffer);
  } catch {
    return { lignes: [], erreurs: ["entries.xlsx illisible (fichier corrompu ou autre format)."], ok: false };
  }
  const ws = wb.getWorksheet(FEUILLES.entries) ?? wb.worksheets[0];
  if (!ws) return { lignes: [], erreurs: ["entries.xlsx : aucune feuille."], ok: false };

  const erreurs: string[] = [];
  HEADERS_ENTRIES.forEach((h, i) => {
    const trouve = texte(ws.getRow(1).getCell(i + 1).value);
    if (trouve !== h) erreurs.push(`entries.xlsx : colonne ${i + 1} attendue "${h}", trouve "${trouve || "(vide)"}".`);
  });
  if (erreurs.length > 0) return { lignes: [], erreurs, ok: false };

  const lignes: LigneEntry[] = [];
  ws.eachRow({ includeEmpty: false }, (row, num) => {
    if (num === 1) return;
    const cell = (i: number) => row.getCell(i).value;
    const date = texte(cell(1));
    const libelle = texte(cell(2));
    const compte = texte(cell(5));
    const type = texte(cell(7)).toLowerCase();
    const montant = nombre(cell(8));
    // Ligne entierement vide -> ignoree (fin de fichier avec cellules formatees).
    if (!date && !libelle && !compte && montant === undefined) return;

    if (type !== "debit" && type !== "credit") {
      erreurs.push(`entries.xlsx ligne ${num} : Type "${texte(cell(7))}" invalide (debit | credit).`);
      return;
    }
    if (montant === undefined || Number.isNaN(montant)) {
      erreurs.push(`entries.xlsx ligne ${num} : Montant TTC illisible ("${texte(cell(8))}").`);
      return;
    }
    const journalBrut = texte(cell(4));
    const journal = (JOURNAUX_ENTRIES as readonly string[]).includes(journalBrut)
      ? (journalBrut as JournalEntry)
      : undefined;
    if (journalBrut && !journal) {
      erreurs.push(`entries.xlsx ligne ${num} : Journal "${journalBrut}" hors liste eStale.`);
      return;
    }
    const tva = nombre(cell(9));
    const deductible = nombre(cell(10));
    const recuperable = nombre(cell(11));
    for (const [nom, v] of [["TVA", tva], ["Déductible", deductible], ["Récupérable", recuperable]] as const) {
      if (v !== undefined && Number.isNaN(v)) {
        erreurs.push(`entries.xlsx ligne ${num} : ${nom} non numerique.`);
        return;
      }
    }
    const piece = texte(cell(3));
    const cle = texte(cell(6));
    const commentaire = texte(cell(12));
    lignes.push({
      date,
      libelle,
      ...(piece ? { piece } : {}),
      ...(journal ? { journal } : {}),
      compte,
      ...(cle ? { cle } : {}),
      type,
      montantTTC: montant,
      ...(tva !== undefined ? { tva } : {}),
      ...(deductible !== undefined ? { deductible } : {}),
      ...(recuperable !== undefined ? { recuperable } : {}),
      ...(commentaire ? { commentaire } : {}),
    });
  });

  return { lignes, erreurs, ok: erreurs.length === 0 };
}
