// Import CSV cote CLIENT (ADR-025). Parsing 100% navigateur : le fichier ne
// monte JAMAIS au serveur. On transforme chaque ligne en SecretClair, qui sera
// chiffre cote client avant envoi (le serveur ne recoit que du chiffre).
//
// CSV = format d'import standard (Bitwarden / 1Password importent en CSV) : pas
// de lib de parsing Excel (surface de CVE) embarquee dans le coffre.

import type { SecretClair } from "@/lib/domain/coffre";

export interface CsvParse {
  entetes: string[];
  lignes: string[][];
}

export type ChampSecret = "titre" | "copropriete" | "immeuble" | "url" | "login" | "motDePasse" | "notes";
export type Mapping = Record<ChampSecret, number | null>;

/** Ordre d'affichage des champs cibles dans l'UI de mapping. */
export const CHAMPS: { cle: ChampSecret; libelle: string }[] = [
  { cle: "titre", libelle: "Titre" },
  { cle: "copropriete", libelle: "Copropriete" },
  { cle: "immeuble", libelle: "Immeuble" },
  { cle: "login", libelle: "Identifiant" },
  { cle: "motDePasse", libelle: "Mot de passe" },
  { cle: "url", libelle: "URL" },
  { cle: "notes", libelle: "Notes" },
];

/** Decode les octets d'un CSV en gerant l'encodage : UTF-8 si valide (ou BOM
 *  UTF-8), sinon Windows-1252 (l'export "CSV" d'Excel FR n'est pas UTF-8 ->
 *  sinon les accents deviennent des caracteres de remplacement). */
export function decoderTexte(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Detecte le delimiteur (Excel FR exporte souvent en point-virgule). */
export function detecterDelimiteur(premiereLigne: string): string {
  const pv = (premiereLigne.match(/;/g) ?? []).length;
  const vg = (premiereLigne.match(/,/g) ?? []).length;
  return pv > vg ? ";" : ",";
}

/** Parse un texte CSV (guillemets, guillemets echappes "", CRLF/LF). */
export function parserCsv(texte: string): CsvParse {
  const t = texte.replace(/^﻿/, ""); // BOM eventuel
  const finPremiere = t.search(/\r?\n/);
  const premiere = finPremiere === -1 ? t : t.slice(0, finPremiere);
  const delim = detecterDelimiteur(premiere);

  const rows: string[][] = [];
  let champ = "";
  let ligne: string[] = [];
  let dansGuillemets = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          champ += '"';
          i++;
        } else {
          dansGuillemets = false;
        }
      } else {
        champ += c;
      }
    } else if (c === '"') {
      dansGuillemets = true;
    } else if (c === delim) {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n") {
      ligne.push(champ);
      rows.push(ligne);
      ligne = [];
      champ = "";
    } else if (c !== "\r") {
      champ += c;
    }
  }
  if (champ !== "" || ligne.length > 0) {
    ligne.push(champ);
    rows.push(ligne);
  }

  const nonVides = rows.filter((r) => r.some((v) => v.trim() !== ""));
  const [entetes = [], ...lignes] = nonVides;
  return { entetes: entetes.map((e) => e.trim()), lignes };
}

/** Devine la colonne de chaque champ a partir des entetes (FR/EN). */
export function detecterColonnes(entetes: string[]): Mapping {
  const norm = entetes.map((e) => e.toLowerCase().trim());
  const trouve = (regex: RegExp): number | null => {
    const i = norm.findIndex((h) => regex.test(h));
    return i === -1 ? null : i;
  };
  return {
    motDePasse: trouve(/mot.?de.?passe|password|pass\b|mdp/),
    login: trouve(/identifiant|e.?mail|login|user|utilisateur|compte/),
    copropriete: trouve(/entit|copro/),
    immeuble: trouve(/immeuble|batiment|residence|adresse/),
    url: trouve(/\burl\b|site|lien|web|domaine/),
    titre: trouve(/entreprise|fournisseur|titre|libell|application|outil|service|name|^nom$/),
    notes: trouve(/autre|info|note|remarque|commentaire|divers/),
  };
}

/** Transforme une ligne en secret. null si pas de mot de passe (ligne ignoree).
 *  Le titre tombe sur l'url ou le login si aucune colonne titre. */
export function versSecret(ligne: string[], map: Mapping): SecretClair | null {
  const val = (i: number | null): string => {
    if (i === null || i >= ligne.length) return "";
    const v = ligne[i].trim();
    // "-", "--", "- " = placeholders vides dans les fichiers REAL31.
    return /^-+$/.test(v) ? "" : v;
  };
  const motDePasse = val(map.motDePasse);
  if (!motDePasse) return null;
  const url = val(map.url);
  const login = val(map.login);
  const notes = val(map.notes);
  const copropriete = val(map.copropriete);
  const immeuble = val(map.immeuble);
  const titre = val(map.titre) || copropriete || url || login || "Sans titre";
  return {
    titre,
    motDePasse,
    ...(copropriete ? { copropriete } : {}),
    ...(immeuble ? { immeuble } : {}),
    ...(url ? { url } : {}),
    ...(login ? { login } : {}),
    ...(notes ? { notes } : {}),
  };
}

/** Cle de deduplication (url + login, insensible a la casse). */
export function cleDedup(s: SecretClair): string {
  return `${(s.url ?? "").toLowerCase()}|${(s.login ?? "").toLowerCase()}`;
}
