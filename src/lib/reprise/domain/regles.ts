// Regles cabinet pures : normalisation (noms/prenoms/codes cles) et predicats de
// liste fermee. Aucune I/O, aucune dependance. Encode fidelement la CLAUDE.md du
// vault (R5 civilites, R6 casse, codes cles prefixes 0).

import { CIVILITES, USAGES, type Civilite, type Usage } from "./patrimoine";

/** L'usage fait-il partie de la liste fermee eStale ? */
export function estUsageValide(u: string): u is Usage {
  return (USAGES as readonly string[]).includes(u);
}

/** La civilite fait-elle partie de la liste fermee stricte (R5) ? */
export function estCiviliteValide(c: string): c is Civilite {
  return (CIVILITES as readonly string[]).includes(c);
}

/** Civilites autorisees pour une personne morale (Pro = Oui) : "m" par defaut, sinon celle du gerant. */
const CIVILITES_PRO_OK: readonly Civilite[] = [
  "m",
  "mme",
  "mm",
  "mmes",
  "m&mme",
  "m|mme",
  "doctor",
  "doctors",
  "master",
  "masters",
  "professor",
  "professors",
];
export function estCivilliteProValide(c: Civilite): boolean {
  return CIVILITES_PRO_OK.includes(c);
}

/**
 * Title Case d'un prenom (R6) : chaque mot capitalise, separateurs " ", "-" et "'"
 * preserves. "JEAN-PIERRE" / "jean-pierre" -> "Jean-Pierre" ; "marie d'arc" -> "Marie D'Arc".
 * Le " & " des couples ("Prenom Mr & Prenom Mme") est preserve.
 */
export function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/([\p{L}])([\p{L}'-]*)/gu, (_m, first: string, rest: string) =>
      first.toUpperCase() + rest.replace(/(['-])(\p{L})/gu, (_x, sep: string, c: string) => sep + c.toUpperCase()),
    );
}

/** Nom en MAJUSCULES (R6). */
export function toNomMajuscules(s: string): string {
  return s.toUpperCase();
}

const TITLE_CASE_OK = /^[\p{Lu}][\p{Ll}']*(?:[-'][\p{Lu}][\p{Ll}']*)*$/u;

/** Un prenom est-il en Title Case valide ? (par mot, separe par espace ou " & "). */
export function estTitleCase(s: string): boolean {
  if (!s.trim()) return false;
  return s
    .split(/\s*&\s*|\s+/)
    .filter(Boolean)
    .every((mot) => TITLE_CASE_OK.test(mot));
}

/** Un nom est-il bien tout en MAJUSCULES (lettres) ? */
export function estMajuscules(s: string): boolean {
  if (!s.trim()) return false;
  return s === s.toUpperCase() && /\p{Lu}/u.test(s);
}

/**
 * Formate un code de cle : prefixe par des "0" pour atteindre 3 chiffres minimum
 * ("1" -> "001", "100" -> "100", "210" -> "210"). Codes deja >= 3 chiffres inchanges.
 * Renvoie la valeur d'origine telle quelle si elle n'est pas purement numerique
 * (signalee par estCodeCleValide).
 */
export function formaterCodeCle(code: string): string {
  const t = code.trim();
  if (!/^\d+$/.test(t)) return t;
  return t.padStart(3, "0");
}

/** Un code de cle est-il valide : purement numerique et prefixe sur 3 chiffres min ? */
export function estCodeCleValide(code: string): boolean {
  return /^\d{3,}$/.test(code);
}
