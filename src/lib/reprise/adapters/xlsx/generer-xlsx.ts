// Generation des .xlsx d'import eStale (role de l'"Agent 3" : deterministe, pas de LLM).
//
// On construit un classeur NEUF avec le nom de feuille et les en-tetes EXACTS releves
// dans les templates eStale (cf. colonnes-estale.ts), puis les lignes data. On ne clone
// PAS le template : sa feuille declare ~1 048 576 lignes + un bloc de documentation, ce
// qui rend la reecriture exceljs prohibitive. eStale importe par nom de colonne ; seuls
// le nom de feuille + la ligne d'en-tete + les donnees comptent.
//
// Deux sorties possibles depuis les memes "specs" : fichiers sur disque (tests, golden)
// ou buffers en memoire (UI / telechargement). La derive eventuelle des templates est
// detectee par verifierTemplatesAJour() (lecture seule), exercee par les tests.

import ExcelJS from "exceljs";
import { join } from "node:path";
import type { Attribution, Cle, JeuDeDonnees, Lot, Owner, Tantieme } from "@/lib/reprise/domain/patrimoine";
import {
  FEUILLES,
  HEADERS_LINKS,
  HEADERS_LOTS,
  HEADERS_OWNERS,
  HEADERS_TANTIEMES,
  TEMPLATES,
} from "./colonnes-estale";

type Cellule = string | number | null;
type TypeFichier = "lots" | "tantiemes" | "owners" | "links_draft" | "links";

interface FichierSpec {
  type: TypeFichier;
  nom: string;
  feuille: string;
  headers: readonly string[];
  lignes: Cellule[][];
  cleCode?: string;
}

export interface OptionsGeneration {
  outDir: string;
}

export interface FichierGenere {
  type: TypeFichier;
  chemin: string;
  cleCode?: string;
  nbLignes: number;
}

export interface FichierBuffer {
  type: TypeFichier;
  nom: string;
  cleCode?: string;
  contenu: Uint8Array;
}

const oN = (b: boolean): string => (b ? "Oui" : "Non");
const occupantCell = (o?: boolean | null): Cellule => (o === true ? "Oui" : o === false ? "Non" : "");
const txt = (s?: string): Cellule => (s && s.trim() ? s : "");

/** Slug court pour les noms de fichiers tantiemes (sans accents, kebab-case). */
export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function ligneLot(l: Lot): Cellule[] {
  return [
    l.numero,
    l.type,
    l.usage,
    txt(l.escalier),
    l.etage ?? "",
    txt(l.porte),
    l.surface ?? "",
    l.nbPiece ?? "",
    l.commentaire ?? "",
  ];
}

function ligneOwner(o: Owner): Cellule[] {
  return [
    oN(o.pro),
    txt(o.formeJuridique),
    txt(o.raisonSociale),
    txt(o.siren),
    o.capital ?? "",
    o.civilite,
    o.nom,
    txt(o.prenom),
    txt(o.naissance),
    txt(o.lieuNaissance),
    txt(o.nationalite),
    txt(o.email),
    txt(o.telPortable),
    txt(o.telFixe),
    occupantCell(o.occupant),
    txt(o.adrNum),
    txt(o.adrVoie),
    txt(o.adrComplement),
    txt(o.adrCodePostal),
    txt(o.adrVille),
    o.paysAdresse && o.paysAdresse.trim() ? o.paysAdresse : "France",
    txt(o.commentaire),
  ];
}

function specLots(lots: Lot[]): FichierSpec {
  return { type: "lots", nom: "lots.xlsx", feuille: FEUILLES.lots, headers: HEADERS_LOTS, lignes: lots.map(ligneLot) };
}

function specOwners(owners: Owner[]): FichierSpec {
  return { type: "owners", nom: "owners.xlsx", feuille: FEUILLES.owners, headers: HEADERS_OWNERS, lignes: owners.map(ligneOwner) };
}

/** Un spec tantiemes par cle (lots non concernes OMIS). */
function specsTantiemes(cles: Cle[], tantiemes: Tantieme[]): FichierSpec[] {
  return cles.map((cle) => ({
    type: "tantiemes",
    nom: `tantiemes_${cle.code}_${slug(cle.libelle)}.xlsx`,
    feuille: FEUILLES.tantiemes,
    headers: HEADERS_TANTIEMES,
    cleCode: cle.code,
    lignes: tantiemes.filter((t) => t.cleCode === cle.code && t.valeur !== 0).map((t): Cellule[] => [t.lot, t.valeur]),
  }));
}

/** PHASE A : col A = NOM en clair (temporaire, NE PAS importer). */
function specLinksDraft(attributions: Attribution[], owners: Owner[]): FichierSpec {
  const nomParId = new Map(owners.map((o) => [o.id, o.prenom ? `${o.nom} ${o.prenom}` : o.nom]));
  return {
    type: "links_draft",
    nom: "links_DRAFT.xlsx",
    feuille: FEUILLES.links,
    headers: HEADERS_LINKS,
    lignes: attributions.map((a): Cellule[] => [nomParId.get(a.ownerId) ?? a.ownerId, a.lot]),
  };
}

/** PHASE B : col A = code eStale 4-car (echoue si un code manque). */
function specLinks(attributions: Attribution[]): FichierSpec {
  return {
    type: "links",
    nom: "links.xlsx",
    feuille: FEUILLES.links,
    headers: HEADERS_LINKS,
    lignes: attributions.map((a): Cellule[] => {
      if (!a.codeEstale) throw new Error(`Attribution lot ${a.lot} : code eStale 4-car manquant (phase B)`);
      return [a.codeEstale, a.lot];
    }),
  };
}

function specsPhaseA(jeu: JeuDeDonnees): FichierSpec[] {
  return [
    specLots(jeu.lots),
    ...specsTantiemes(jeu.cles, jeu.tantiemes),
    specOwners(jeu.owners),
    specLinksDraft(jeu.attributions, jeu.owners),
  ];
}

function construireClasseur(spec: FichierSpec): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(spec.feuille);
  ws.addRow([...spec.headers]);
  for (const ligne of spec.lignes) ws.addRow(ligne);
  return wb;
}

async function versBuffer(spec: FichierSpec): Promise<FichierBuffer> {
  const buf = await construireClasseur(spec).xlsx.writeBuffer();
  return { type: spec.type, nom: spec.nom, cleCode: spec.cleCode, contenu: new Uint8Array(buf as ArrayBuffer) };
}

async function versFichier(spec: FichierSpec, outDir: string): Promise<FichierGenere> {
  const chemin = join(outDir, spec.nom);
  await construireClasseur(spec).xlsx.writeFile(chemin);
  return { type: spec.type, chemin, cleCode: spec.cleCode, nbLignes: spec.lignes.length };
}

/** Genere lots + tantiemes (1/cle) + owners + links_DRAFT sur disque (phase A). */
export async function genererPhaseA(jeu: JeuDeDonnees, opts: OptionsGeneration): Promise<FichierGenere[]> {
  const out: FichierGenere[] = [];
  for (const spec of specsPhaseA(jeu)) out.push(await versFichier(spec, opts.outDir));
  return out;
}

/** Idem en buffers memoire (UI / telechargement). */
export async function genererPhaseABuffers(jeu: JeuDeDonnees): Promise<FichierBuffer[]> {
  return Promise.all(specsPhaseA(jeu).map(versBuffer));
}

/** PHASE B : links.xlsx final sur disque (col A = code eStale 4-car). */
export async function genererLinks(attributions: Attribution[], opts: OptionsGeneration): Promise<FichierGenere> {
  return versFichier(specLinks(attributions), opts.outDir);
}

/**
 * Detection de derive : relit les templates eStale (lecture rapide) et verifie que le
 * nom de feuille et l'ordre des en-tetes correspondent toujours a notre spec.
 */
export async function verifierTemplatesAJour(templatesDir: string): Promise<string[]> {
  const ecarts: string[] = [];
  const cas: { fichier: string; feuille: string; headers: readonly string[] }[] = [
    { fichier: TEMPLATES.lots, feuille: FEUILLES.lots, headers: HEADERS_LOTS },
    { fichier: TEMPLATES.tantiemes, feuille: FEUILLES.tantiemes, headers: HEADERS_TANTIEMES },
    { fichier: TEMPLATES.owners, feuille: FEUILLES.owners, headers: HEADERS_OWNERS },
    { fichier: TEMPLATES.links, feuille: FEUILLES.links, headers: HEADERS_LINKS },
  ];
  for (const { fichier, feuille, headers } of cas) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(join(templatesDir, fichier));
    const ws = wb.worksheets[0];
    if (!ws) {
      ecarts.push(`${fichier} : aucune feuille`);
      continue;
    }
    if (ws.name !== feuille) ecarts.push(`${fichier} : feuille "${ws.name}" != "${feuille}"`);
    headers.forEach((h, i) => {
      const trouve = String(ws.getRow(1).getCell(i + 1).value ?? "").trim();
      if (trouve !== h) ecarts.push(`${fichier} col ${i + 1} : "${trouve}" != "${h}"`);
    });
  }
  return ecarts;
}
