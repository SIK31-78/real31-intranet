// Parseur des fichiers .xlsx VERSES par le gestionnaire (entree du volet patrimoine).
//
// C'est le MIROIR de generer-xlsx.ts : ce que la generation ecrit (nom de feuille + en-tetes
// EXACTS des templates eStale, cf. colonnes-estale.ts), ce parseur sait le relire. Les fichiers
// sont produits HORS module (par le skill estale-migration) puis verses ici : le module les
// PARSE, les VALIDE (auto-checks + rapprochement 450) et n'injecte qu'apres GO humain.
//
// Philosophie de validation :
//   - une STRUCTURE cassee (feuille absente, colonnes manquantes/desordonnees, code de cle
//     indeterminable) est une ERREUR de parsing -> le fichier est refuse, message actionnable ;
//   - une VALEUR metier douteuse (usage hors liste, tantieme a 0, doublon d'owner...) n'est PAS
//     tranchee ici : elle passe dans le jeu et ce sont les AUTO-CHECKS deterministes
//     (domain/auto-checks.ts) qui la signalent - un seul endroit qui dit "GO ou STOP".
//   - JAMAIS de ligne ecartee en silence : tout ce qui est ignore est compte et note.

import ExcelJS from "exceljs";
import type {
  Attribution,
  Cle,
  JeuDeDonnees,
  Lot,
  Owner,
  Tantieme,
  Usage,
  Civilite,
} from "@/lib/reprise/domain/patrimoine";
import { FEUILLES, HEADERS_LINKS, HEADERS_LOTS, HEADERS_OWNERS, HEADERS_TANTIEMES } from "./colonnes-estale";

/** Un fichier verse par le gestionnaire (nom d'origine + octets). */
export interface FichierEntree {
  nom: string;
  contenu: Uint8Array;
}

/** Type d'un fichier d'entree, deduit du NOM (aiguillage conservateur). */
export type TypeFichierEntree = "lots" | "tantiemes" | "owners" | "links" | "inconnu";

/**
 * Aiguillage par nom de fichier. Reconnait les noms produits par generer-xlsx.ts ET les noms
 * des templates eStale (le skill peut livrer "dkl.xlsx" renomme "tantiemes_001_....xlsx").
 * Un nom inconnu n'est pas une erreur ici : l'appelant decide (note de vigilance).
 */
export function typeFichierEntree(nom: string): TypeFichierEntree {
  const n = nom.toLowerCase();
  if (!n.endsWith(".xlsx")) return "inconnu";
  if (/(^|[\s_-])lots?([\s_.-]|$)/.test(n)) return "lots";
  if (/tanti[eè]mes?|(^|[\s_-])tant[\s_-]|(^|[\s_-])dkl([\s_.-]|$)/.test(n)) return "tantiemes";
  if (/owners?|copropri[eé]taires?/.test(n)) return "owners";
  if (/links?|r[eé]partitions?|attributions?/.test(n)) return "links";
  return "inconnu";
}

/** Resultat du parsing d'un lot de fichiers : le jeu assemble + erreurs structurelles + notes. */
export interface ResultatParseXlsx {
  jeu: JeuDeDonnees;
  /** Erreurs STRUCTURELLES (fichier illisible, colonnes manquantes, owner introuvable...). */
  erreurs: string[];
  /** Notes de vigilance (fichier ignore, feuille de repli, libelle de cle reconstruit...). */
  notes: string[];
  /** true si aucune erreur structurelle (les checks metier restent a passer en aval). */
  ok: boolean;
}

// --- Lecture de cellules (ExcelJS rend des types varies : string, number, richText, formule) ---

type CelluleExcel = ExcelJS.CellValue;

/** Valeur TEXTE d'une cellule (richText/formule/date aplaties), "" si vide. */
function celluleTexte(v: CelluleExcel): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (v instanceof Date) {
    // Date Excel relue : on la rend au format cabinet JJ/MM/AAAA (cas des dates de naissance).
    const jj = String(v.getUTCDate()).padStart(2, "0");
    const mm = String(v.getUTCMonth() + 1).padStart(2, "0");
    return `${jj}/${mm}/${v.getUTCFullYear()}`;
  }
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("result" in v) return celluleTexte(v.result as CelluleExcel);
    if ("text" in v) return String((v as { text: unknown }).text).trim();
  }
  return String(v).trim();
}

/** Valeur NOMBRE d'une cellule, undefined si vide, NaN si illisible (l'appelant signale). */
function celluleNombre(v: CelluleExcel): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number") return v;
  const t = celluleTexte(v).replace(/\s/g, "").replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** "Oui"/"Non" -> booleen ; "" -> undefined ; autre -> undefined (l'auto-check verra). */
function celluleOuiNon(v: CelluleExcel): boolean | undefined {
  const t = celluleTexte(v).toLowerCase();
  if (t === "oui" || t === "yes" || t === "true") return true;
  if (t === "non" || t === "no" || t === "false") return false;
  return undefined;
}

// --- Ouverture d'un classeur + verification des en-tetes ---------------------------

interface FeuilleOuverte {
  ws: ExcelJS.Worksheet;
  notes: string[];
}

/**
 * Ouvre le classeur et retrouve la feuille attendue (par nom exact, sinon 1re feuille avec
 * note de vigilance). Verifie les EN-TETES EXACTS (ordre + libelles, comme la spec des
 * templates) : le moindre ecart est une erreur STRUCTURELLE listee colonne par colonne.
 */
async function ouvrirFeuille(
  fichier: FichierEntree,
  feuilleAttendue: string,
  headers: readonly string[],
): Promise<{ ok: true; feuille: FeuilleOuverte } | { ok: false; erreurs: string[] }> {
  const wb = new ExcelJS.Workbook();
  try {
    // Le type attendu par exceljs est son propre `Buffer extends ArrayBuffer` : on passe
    // donc l'ArrayBuffer d'une COPIE du Uint8Array (slice = buffer a la bonne taille).
    await wb.xlsx.load(fichier.contenu.slice().buffer as ArrayBuffer);
  } catch {
    return { ok: false, erreurs: [`${fichier.nom} : fichier illisible (xlsx corrompu ou autre format).`] };
  }
  const notes: string[] = [];
  let ws = wb.getWorksheet(feuilleAttendue);
  if (!ws) {
    ws = wb.worksheets[0];
    if (!ws) return { ok: false, erreurs: [`${fichier.nom} : aucune feuille dans le classeur.`] };
    notes.push(`${fichier.nom} : feuille "${feuilleAttendue}" absente, lecture de "${ws.name}" (a verifier).`);
  }
  const erreurs: string[] = [];
  headers.forEach((h, i) => {
    const trouve = celluleTexte(ws!.getRow(1).getCell(i + 1).value);
    if (trouve !== h) {
      erreurs.push(`${fichier.nom} : colonne ${i + 1} attendue "${h}", trouve "${trouve || "(vide)"}" - le fichier ne suit pas le template eStale.`);
    }
  });
  if (erreurs.length > 0) return { ok: false, erreurs };
  return { ok: true, feuille: { ws, notes } };
}

/** Iteration sur les lignes DATA (a partir de la ligne 2), lignes entierement vides ignorees. */
function lignesData(ws: ExcelJS.Worksheet, nbColonnes: number): { index: number; cellules: CelluleExcel[] }[] {
  const out: { index: number; cellules: CelluleExcel[] }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, num) => {
    if (num === 1) return; // en-tete
    const cellules: CelluleExcel[] = [];
    let vide = true;
    for (let i = 1; i <= nbColonnes; i++) {
      const v = row.getCell(i).value;
      cellules.push(v);
      if (celluleTexte(v) !== "") vide = false;
    }
    if (!vide) out.push({ index: num, cellules });
  });
  return out;
}

// --- Parseurs par type de fichier ---------------------------------------------------

function parserLots(nom: string, feuille: FeuilleOuverte): { lots: Lot[]; erreurs: string[] } {
  const lots: Lot[] = [];
  const erreurs: string[] = [];
  for (const { index, cellules } of lignesData(feuille.ws, HEADERS_LOTS.length)) {
    const [cNum, cType, cUsage, cEsc, cEtage, cPorte, cSurf, cNb, cComm] = cellules;
    const numero = celluleNombre(cNum);
    if (numero === undefined || Number.isNaN(numero)) {
      erreurs.push(`${nom} ligne ${index} : N° Lot illisible ("${celluleTexte(cNum)}").`);
      continue;
    }
    const etage = celluleNombre(cEtage);
    const surface = celluleNombre(cSurf);
    const nbPiece = celluleNombre(cNb);
    if (Number.isNaN(etage)) erreurs.push(`${nom} ligne ${index} : Étage non numerique ("${celluleTexte(cEtage)}") - RDC = 0, sous-sol = -1.`);
    if (Number.isNaN(surface)) erreurs.push(`${nom} ligne ${index} : Surface non numerique ("${celluleTexte(cSurf)}").`);
    if (Number.isNaN(nbPiece)) erreurs.push(`${nom} ligne ${index} : Nb Pièce non numerique ("${celluleTexte(cNb)}").`);
    const escalier = celluleTexte(cEsc);
    const porte = celluleTexte(cPorte);
    lots.push({
      numero,
      type: celluleTexte(cType),
      // La liste fermee est verifiee par l'auto-check LOT_USAGE_HORS_LISTE (un seul juge).
      usage: celluleTexte(cUsage) as Usage,
      ...(escalier ? { escalier } : {}),
      ...(etage !== undefined && !Number.isNaN(etage) ? { etage } : {}),
      ...(porte ? { porte } : {}),
      ...(surface !== undefined && !Number.isNaN(surface) ? { surface } : {}),
      ...(nbPiece !== undefined && !Number.isNaN(nbPiece) ? { nbPiece } : {}),
      commentaire: celluleTexte(cComm),
    });
  }
  return { lots, erreurs };
}

/**
 * Code + libelle de cle deduits du NOM du fichier tantiemes : "tantiemes_001_charges-generales
 * .xlsx" -> code "001", libelle "charges generales". Le libelle est LOSSY (slug sans accents) :
 * il se corrige dans l'editeur patrimoine ; le total attendu, lui, se verifie contre la capture
 * eStale (R1). Un fichier sans code lisible est refuse (jamais de cle devinee).
 */
function cleDepuisNom(nom: string): { code: string; libelle: string } | null {
  const base = nom.replace(/\.xlsx$/i, "");
  const m = base.match(/(?:tanti[eè]mes?|tant|dkl)[\s_-]*(\d{3,})(?:[\s_-]+(.*))?$/i);
  if (!m) return null;
  const libelle = (m[2] ?? "").replace(/[-_]+/g, " ").trim();
  return { code: m[1], libelle: libelle || `Cle ${m[1]}` };
}

function parserTantiemes(
  nom: string,
  feuille: FeuilleOuverte,
): { cle: Cle; tantiemes: Tantieme[]; erreurs: string[] } | { erreurs: string[] } {
  const infoCle = cleDepuisNom(nom);
  if (!infoCle) {
    return {
      erreurs: [
        `${nom} : code de cle indeterminable depuis le nom du fichier. Nomme le fichier "tantiemes_<code>_<libelle>.xlsx" (ex. tantiemes_001_charges-generales.xlsx).`,
      ],
    };
  }
  const tantiemes: Tantieme[] = [];
  const erreurs: string[] = [];
  for (const { index, cellules } of lignesData(feuille.ws, HEADERS_TANTIEMES.length)) {
    const [cLot, cVal] = cellules;
    const lot = celluleNombre(cLot);
    const valeur = celluleNombre(cVal);
    if (lot === undefined || Number.isNaN(lot)) {
      erreurs.push(`${nom} ligne ${index} : N° Lot illisible ("${celluleTexte(cLot)}").`);
      continue;
    }
    if (valeur === undefined || Number.isNaN(valeur)) {
      erreurs.push(`${nom} ligne ${index} : Tantième illisible ("${celluleTexte(cVal)}").`);
      continue;
    }
    tantiemes.push({ cleCode: infoCle.code, lot, valeur });
  }
  // Total attendu = somme des lignes versees. La VRAIE reference reste la capture eStale (R1) :
  // le gestionnaire la confronte au recap ; l'editeur permet de corriger le total si besoin.
  const totalAttendu = tantiemes.reduce((s, t) => s + t.valeur, 0);
  const cle: Cle = {
    code: infoCle.code,
    libelle: infoCle.libelle,
    totalAttendu,
    ...(infoCle.code === "001" ? { defaut: true } : {}),
  };
  return { cle, tantiemes, erreurs };
}

function parserOwners(nom: string, feuille: FeuilleOuverte): { owners: Owner[]; erreurs: string[] } {
  const owners: Owner[] = [];
  const erreurs: string[] = [];
  let seq = 0;
  for (const { index, cellules } of lignesData(feuille.ws, HEADERS_OWNERS.length)) {
    const [
      cPro, cForme, cRaison, cSiren, cCapital, cCiv, cNom, cPrenom, cNaissance, cLieu,
      cNat, cEmail, cPortable, cFixe, cOccupant, cAdrNum, cAdrVoie, cAdrCompl, cAdrCp,
      cAdrVille, cAdrPays, cComm,
    ] = cellules;
    const nomOwner = celluleTexte(cNom);
    if (!nomOwner) {
      erreurs.push(`${nom} ligne ${index} : Nom vide (colonne obligatoire).`);
      continue;
    }
    seq++;
    const capital = celluleNombre(cCapital);
    if (Number.isNaN(capital)) erreurs.push(`${nom} ligne ${index} : Capital social non numerique ("${celluleTexte(cCapital)}") - eStale le refuse.`);
    const occupant = celluleOuiNon(cOccupant);
    const champTexte = (v: CelluleExcel): string | undefined => {
      const t = celluleTexte(v);
      return t ? t : undefined;
    };
    const pays = celluleTexte(cAdrPays);
    owners.push({
      // Identifiant interne STABLE par ordre de ligne : c'est lui qui relie owners <-> links
      // avant l'attribution des codes eStale (meme convention que la generation).
      id: `o${seq}`,
      civilite: celluleTexte(cCiv).toLowerCase() as Civilite,
      nom: nomOwner,
      ...(champTexte(cPrenom) ? { prenom: champTexte(cPrenom) } : {}),
      pro: celluleOuiNon(cPro) ?? false,
      ...(champTexte(cNaissance) ? { naissance: champTexte(cNaissance) } : {}),
      ...(champTexte(cEmail) ? { email: champTexte(cEmail) } : {}),
      occupant: occupant === undefined ? null : occupant,
      ...(champTexte(cLieu) ? { lieuNaissance: champTexte(cLieu) } : {}),
      ...(champTexte(cNat) ? { nationalite: champTexte(cNat) } : {}),
      ...(champTexte(cPortable) ? { telPortable: champTexte(cPortable) } : {}),
      ...(champTexte(cFixe) ? { telFixe: champTexte(cFixe) } : {}),
      ...(champTexte(cAdrNum) ? { adrNum: champTexte(cAdrNum) } : {}),
      ...(champTexte(cAdrVoie) ? { adrVoie: champTexte(cAdrVoie) } : {}),
      ...(champTexte(cAdrCompl) ? { adrComplement: champTexte(cAdrCompl) } : {}),
      ...(champTexte(cAdrCp) ? { adrCodePostal: champTexte(cAdrCp) } : {}),
      ...(champTexte(cAdrVille) ? { adrVille: champTexte(cAdrVille) } : {}),
      ...(pays ? { paysAdresse: pays } : {}),
      ...(champTexte(cForme) ? { formeJuridique: champTexte(cForme) } : {}),
      ...(champTexte(cRaison) ? { raisonSociale: champTexte(cRaison) } : {}),
      ...(champTexte(cSiren) ? { siren: champTexte(cSiren) } : {}),
      ...(capital !== undefined && !Number.isNaN(capital) ? { capital } : {}),
      ...(champTexte(cComm) ? { commentaire: champTexte(cComm) } : {}),
    });
  }
  return { owners, erreurs };
}

/** Normalisation d'un nom pour le rapprochement links -> owners (casse/accents/espaces). */
function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Le fichier links verse porte les NOMS en clair (format DRAFT de la generation : la copro
 * n'existe pas encore dans eStale, les codes 4 caracteres n'existent donc pas). On rapproche
 * chaque nom des owners du fichier owners.xlsx pour retrouver l'ownerId. Un code 4 caracteres
 * (fichier phase B) est refuse avec un message qui explique quoi verser a la place.
 */
function parserLinks(
  nom: string,
  feuille: FeuilleOuverte,
  owners: Owner[],
): { attributions: Attribution[]; erreurs: string[] } {
  const attributions: Attribution[] = [];
  const erreurs: string[] = [];

  // Index nom -> ownerId : "NOM Prenom" ET "NOM" seul (quand le prenom manque dans links).
  // Une cle ambigue (deux owners au meme nom complet) est retiree : on prefere une erreur
  // explicite a un rattachement au hasard entre homonymes.
  const parNom = new Map<string, string | null>();
  const poser = (cle: string, id: string) => {
    if (!cle) return;
    parNom.set(cle, parNom.has(cle) ? null : id);
  };
  for (const o of owners) {
    poser(normaliser(o.prenom ? `${o.nom} ${o.prenom}` : o.nom), o.id);
    if (o.prenom) poser(normaliser(o.nom), o.id);
  }

  for (const { index, cellules } of lignesData(feuille.ws, HEADERS_LINKS.length)) {
    const [cQui, cLot] = cellules;
    const qui = celluleTexte(cQui);
    const lot = celluleNombre(cLot);
    if (lot === undefined || Number.isNaN(lot)) {
      erreurs.push(`${nom} ligne ${index} : N° Lot illisible ("${celluleTexte(cLot)}").`);
      continue;
    }
    if (!qui) {
      erreurs.push(`${nom} ligne ${index} : N° Copropriétaire vide.`);
      continue;
    }
    const id = parNom.get(normaliser(qui));
    if (id === null) {
      erreurs.push(`${nom} ligne ${index} : "${qui}" est ambigu (plusieurs coproprietaires portent ce nom) - precise le prenom dans la colonne.`);
      continue;
    }
    if (id === undefined) {
      if (/^[0-9A-Za-z]{4}$/.test(qui)) {
        erreurs.push(
          `${nom} ligne ${index} : "${qui}" ressemble a un code eStale 4 caracteres (fichier phase B). L'injection par API n'en a pas besoin : verse le links en NOMS (links_DRAFT, colonne A = nom du coproprietaire).`,
        );
      } else {
        erreurs.push(`${nom} ligne ${index} : coproprietaire "${qui}" introuvable dans owners.xlsx.`);
      }
      continue;
    }
    attributions.push({ ownerId: id, lot });
  }
  return { attributions, erreurs };
}

// --- Assemblage -----------------------------------------------------------------

/**
 * Parse un LOT de fichiers verses et assemble le JeuDeDonnees. L'aiguillage est fait par NOM
 * (typeFichierEntree). Les fichiers inconnus sont notes, jamais ecartes en silence. Le fichier
 * links est parse EN DERNIER (il a besoin des owners pour resoudre les noms).
 */
export async function parserJeuDepuisXlsx(fichiers: FichierEntree[]): Promise<ResultatParseXlsx> {
  const erreurs: string[] = [];
  const notes: string[] = [];

  const lots: Lot[] = [];
  const cles: Cle[] = [];
  const tantiemes: Tantieme[] = [];
  const owners: Owner[] = [];
  const linksAParser: { nom: string; feuille: FeuilleOuverte }[] = [];

  let nbLotsF = 0;
  let nbOwnersF = 0;

  for (const f of fichiers) {
    const type = typeFichierEntree(f.nom);
    switch (type) {
      case "lots": {
        nbLotsF++;
        const r = await ouvrirFeuille(f, FEUILLES.lots, HEADERS_LOTS);
        if (!r.ok) {
          erreurs.push(...r.erreurs);
          break;
        }
        notes.push(...r.feuille.notes);
        const p = parserLots(f.nom, r.feuille);
        lots.push(...p.lots);
        erreurs.push(...p.erreurs);
        break;
      }
      case "tantiemes": {
        const r = await ouvrirFeuille(f, FEUILLES.tantiemes, HEADERS_TANTIEMES);
        if (!r.ok) {
          erreurs.push(...r.erreurs);
          break;
        }
        notes.push(...r.feuille.notes);
        const p = parserTantiemes(f.nom, r.feuille);
        erreurs.push(...p.erreurs);
        if ("cle" in p) {
          if (cles.some((c) => c.code === p.cle.code)) {
            erreurs.push(`${f.nom} : la cle ${p.cle.code} est deja versee par un autre fichier tantiemes (doublon de cle).`);
          } else {
            cles.push(p.cle);
            tantiemes.push(...p.tantiemes);
          }
        }
        break;
      }
      case "owners": {
        nbOwnersF++;
        const r = await ouvrirFeuille(f, FEUILLES.owners, HEADERS_OWNERS);
        if (!r.ok) {
          erreurs.push(...r.erreurs);
          break;
        }
        notes.push(...r.feuille.notes);
        const p = parserOwners(f.nom, r.feuille);
        owners.push(...p.owners);
        erreurs.push(...p.erreurs);
        break;
      }
      case "links": {
        const r = await ouvrirFeuille(f, FEUILLES.links, HEADERS_LINKS);
        if (!r.ok) {
          erreurs.push(...r.erreurs);
          break;
        }
        notes.push(...r.feuille.notes);
        linksAParser.push({ nom: f.nom, feuille: r.feuille });
        break;
      }
      default:
        notes.push(`${f.nom} : fichier non reconnu (attendus : lots / tantiemes_<code> / owners / links) - ignore.`);
    }
  }

  if (nbLotsF > 1) erreurs.push(`${nbLotsF} fichiers lots verses : un seul attendu.`);
  if (nbOwnersF > 1) erreurs.push(`${nbOwnersF} fichiers owners verses : un seul attendu.`);

  // Links en dernier : la resolution des noms exige les owners.
  const attributions: Attribution[] = [];
  for (const l of linksAParser) {
    if (owners.length === 0) {
      erreurs.push(`${l.nom} : impossible de resoudre les noms sans owners.xlsx (verse-le dans le meme lot).`);
      continue;
    }
    const p = parserLinks(l.nom, l.feuille, owners);
    attributions.push(...p.attributions);
    erreurs.push(...p.erreurs);
  }

  return {
    jeu: { lots, cles, tantiemes, owners, attributions },
    erreurs,
    notes,
    ok: erreurs.length === 0,
  };
}
