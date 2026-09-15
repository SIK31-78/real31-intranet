// Rapprocher une proposition (une adresse tapee a la main, souvent dans l'Excel d'origine :
// « 62, rue Jean Bonal - LGC », « 2/4/4 bis avenue Rhin et Danube ») d'une copropriete du
// registre national, dont l'IMMATRICULATION est la seule cle stable d'un immeuble.
//
// Regle tranchee par Sekou (15/09/2026) : rattachement automatique quand numero + voie +
// commune coincident et qu'un seul immeuble du registre correspond ; sinon un humain choisit.
// Fonctions pures, sans dependance.

export interface AdresseAnalysee {
  /** Les numeros de voie ecrits (« 2 », « 4 », « 4bis »), normalises sans espace. */
  numeros: string[];
  /** Les mots significatifs de la voie (sans type de voie ni mots vides). */
  voie: string[];
  /** Le type de voie canonique (rue, avenue, boulevard...), s'il est ecrit. */
  typeVoie?: string;
  /** La commune, normalisee, si on a pu la lire (suffixe, code postal, code agence). */
  commune?: string;
  codePostal?: string;
}

/** Les codes que le cabinet ecrit a la place de la commune (« - LGC », « - ML »). */
export const COMMUNE_PAR_CODE: Record<string, string> = {
  LGC: "la garenne colombes",
  ML: "maisons laffitte",
  HLS: "houilles",
  ASN: "asnieres sur seine",
  ASS: "asnieres sur seine",
  BZS: "bezons",
  CBV: "courbevoie",
  LMR: "le mesnil le roi",
};

/** Abreviation -> type de voie canonique. */
const TYPE_VOIE_CANONIQUE: Record<string, string> = {
  rue: "rue", r: "rue",
  av: "avenue", ave: "avenue", avenue: "avenue",
  bd: "boulevard", bld: "boulevard", bl: "boulevard", boulevard: "boulevard",
  pl: "place", place: "place",
  all: "allee", allee: "allee",
  imp: "impasse", impasse: "impasse",
  ch: "chemin", chemin: "chemin",
  sq: "square", square: "square",
  res: "residence", residence: "residence",
  pass: "passage", passage: "passage",
  rte: "route", route: "route",
  villa: "villa", quai: "quai", cours: "cours", sente: "sente", voie: "voie", cite: "cite", hameau: "hameau", promenade: "promenade",
};
const TYPES_VOIE = new Set(Object.keys(TYPE_VOIE_CANONIQUE));
const MOTS_VIDES = new Set(["de", "des", "du", "d", "la", "le", "les", "l", "et", "a", "au", "aux", "en", "sur", "sous", "saint", "st", "ste", "sainte", "general", "gal", "marechal", "mal", "president", "pdt", "docteur", "dr", "professeur", "pr"]);

export function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function motsVoie(texte: string): string[] {
  return normaliser(texte)
    .split(" ")
    .filter((m) => m && !TYPES_VOIE.has(m) && !MOTS_VIDES.has(m) && !/^\d/.test(m));
}

/**
 * Lit une adresse libre. Le suffixe apres « - » ou « à » est une commune ou un code
 * agence ; un code postal (5 chiffres) fixe aussi la commune si un nom le suit.
 * Sans commune ecrite on ne devine rien (une agence couvre plusieurs villes) : le
 * rapprochement restera « probable », a confirmer.
 */
export function analyserAdresse(texte: string): AdresseAnalysee {
  let corps = texte.trim();
  let commune: string | undefined;
  let codePostal: string | undefined;

  // Suffixe « - LGC », « - Courbevoie », « à Asnières », « - Paris (17eme) » : le DERNIER
  // « - » ou « à » entoure d'espaces (« 120 - 130 Place Malraux - HLS » garde ses numeros).
  const suffixe = corps.match(/^(.*)\s+(?:[-–]|[àa])\s+(.+)$/);
  if (suffixe) {
    const fin = suffixe[2].replace(/\(.*?\)/g, "").trim();
    const code = fin.toUpperCase().replace(/[^A-Z]/g, "");
    if (COMMUNE_PAR_CODE[code]) {
      commune = COMMUNE_PAR_CODE[code];
      corps = suffixe[1];
    } else if (/^paris\b/i.test(fin)) {
      commune = "paris";
      corps = suffixe[1];
    } else if (fin && (!/\d/.test(fin) || /^\d{5}\s+\D/.test(fin))) {
      const cp = fin.match(/^(\d{5})\s+(.+)$/);
      commune = normaliser(cp ? cp[2] : fin);
      if (cp) codePostal = cp[1];
      corps = suffixe[1];
    }
  }
  if (!commune) {
    // Code agence colle en fin : « 84 bis av Foch LGC », « 61 rue sartoris-LGC ».
    const fin = corps.match(/(?:\s+|\s*[-–]\s*)([A-Za-z]{2,3})$/);
    if (fin && COMMUNE_PAR_CODE[fin[1].toUpperCase()]) {
      commune = COMMUNE_PAR_CODE[fin[1].toUpperCase()];
      corps = corps.slice(0, fin.index);
    }
  }
  if (!commune) {
    const cp = corps.match(/\b(\d{5})\s+([A-Za-zÀ-ÿ' -]+)$/);
    if (cp) {
      codePostal = cp[1];
      commune = normaliser(cp[2]);
      corps = corps.slice(0, cp.index);
    }
  }
  if (commune && /^paris\b/.test(commune)) commune = "paris";

  // Les numeros : tout ce qui precede le premier mot de voie, decoupe sur / , - et espaces.
  const m = corps.match(/^\s*([\d\s\/,\-–]*\d(?:\s*(?:bis|ter|b|t)\b)?(?:[\s\/,\-–]+\d+(?:\s*(?:bis|ter|b|t)\b)?)*)/i);
  const numeros: string[] = [];
  let reste = corps;
  if (m) {
    for (const n of m[1].replace(/(\d)\s+(bis|ter|b|t)\b/gi, "$1$2").split(/[\s\/,\-–]+/)) {
      const x = n.toLowerCase().replace(/\s+/g, "");
      if (/^\d+(bis|ter|b|t)?$/.test(x)) numeros.push(x.replace(/b$/, "bis").replace(/t$/, "ter"));
    }
    reste = corps.slice(m[0].length);
  }
  const voie = motsVoie(reste);
  const premierMot = normaliser(reste).split(" ").find(Boolean);
  const typeVoie = premierMot ? TYPE_VOIE_CANONIQUE[premierMot] : undefined;
  return { numeros: [...new Set(numeros)], voie, ...(typeVoie ? { typeVoie } : {}), ...(commune ? { commune } : {}), ...(codePostal ? { codePostal } : {}) };
}

export interface CandidatRegistre {
  immatriculation: string;
  adresse: string;
  /** Les autres adresses de l'immeuble au registre (angle de rue, second acces). */
  adressesCompl?: string[];
  commune: string;
  codePostal: string;
}

/** Meme numero. « 52 » et « 52 ter » ne sont pas la meme chose, mais ce n'est pas loin. */
function comparerNumeros(a: string[], b: string[]): "meme" | "proche" | "non" {
  if (a.some((n) => b.includes(n))) return "meme";
  const chiffres = (n: string) => n.replace(/\D/g, "");
  if (a.some((n) => b.some((m) => chiffres(n) === chiffres(m)))) return "proche";
  return "non";
}

export type NiveauRapprochement = "sur" | "probable" | "non";

/**
 * Compare une adresse analysee a une copropriete du registre.
 * - « sur » : meme numero, memes mots de voie, meme commune.
 * - « probable » : numero et voie coincident mais la commune est inconnue ou differe
 *   d'une graphie (a montrer a un humain).
 */
export function comparer(a: AdresseAnalysee, c: CandidatRegistre): NiveauRapprochement {
  if (a.numeros.length === 0 || a.voie.length === 0) return "non";
  // L'immeuble peut avoir plusieurs adresses au registre : la meilleure compte.
  let meilleur: NiveauRapprochement = "non";
  for (const adresse of [c.adresse, ...(c.adressesCompl ?? [])]) {
    const cand = analyserAdresse(adresse);
    if (cand.numeros.length === 0 || cand.voie.length === 0) continue;
    const numero = comparerNumeros(a.numeros, cand.numeros);
    if (numero === "non") continue;
    // Les mots de la voie du registre doivent tous etre dans l'adresse saisie (le registre
    // est la graphie de reference, la saisie peut en dire plus : « Carré Foch »).
    if (!cand.voie.every((m) => a.voie.includes(m))) continue;
    // Une autre commune, c'est non. Sinon « 52 ter » contre « 52 », ou « rue » contre
    // « boulevard », se verifient par un humain.
    const typeDiffere = a.typeVoie && cand.typeVoie && a.typeVoie !== cand.typeVoie;
    let niveau = comparerCommune(a, c);
    if (niveau === "sur" && (numero === "proche" || typeDiffere)) niveau = "probable";
    if (niveau === "sur") return "sur";
    if (niveau === "probable") meilleur = "probable";
  }
  return meilleur;
}

function comparerCommune(a: AdresseAnalysee, c: CandidatRegistre): NiveauRapprochement {
  const communeCandidat = normaliser(c.commune);
  if (!a.commune) return "probable";
  if (a.commune === communeCandidat) return "sur";
  if (a.codePostal && a.codePostal === c.codePostal) return "sur";
  // « Asnières » vs « Asnières-sur-Seine » : l'un commence par l'autre.
  if (communeCandidat.startsWith(a.commune) || a.commune.startsWith(communeCandidat)) return "sur";
  return "non";
}

export interface ResultatRapprochement {
  /** Le rattachement automatique : un seul candidat « sur ». */
  sur?: CandidatRegistre;
  /** Les candidats a montrer a un humain (sur multiples, ou probables). */
  candidats: CandidatRegistre[];
}

export function rapprocher(a: AdresseAnalysee, candidats: CandidatRegistre[]): ResultatRapprochement {
  const surs = candidats.filter((c) => comparer(a, c) === "sur");
  if (surs.length === 1) return { sur: surs[0], candidats: surs };
  const probables = candidats.filter((c) => comparer(a, c) === "probable");
  return { candidats: [...surs, ...probables] };
}

/**
 * De quoi chercher les candidats au registre : l'un des numeros (chiffres seuls, le
 * « bis » se compare apres) ET les mots de la voie. Pas la commune, pour laisser les
 * « probables » remonter.
 */
export function requeteRegistre(a: AdresseAnalysee): { numeros: string[]; voie: string[] } {
  return { numeros: [...new Set(a.numeros.map((n) => n.replace(/\D/g, "")))], voie: a.voie.slice(0, 3) };
}

/** Une immatriculation ecrite dans l'adresse elle-meme (« … - HLS AD0957118 »). */
export function immatriculationDansTexte(texte: string): string | undefined {
  return texte.match(/\b([A-Z]{2}\d{7})\b/i)?.[1]?.toUpperCase();
}
