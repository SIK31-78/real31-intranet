// Listes de diffusion Crypto (increment 2 "dates CS/AG"). Logique PURE (domaine,
// ADR-001) : parsing du CSV d'export, classification (conseil syndical / proprietaires /
// autre), extraction de la reference copro, et destinataires nettoyes d'une liste CS.
//
// SOURCE = fallback transitionnel : le parc reste sur Crypto jusqu'a janvier. Pour les
// copros sur eStale, les emails du conseil se lisent LIVE (owner.email) -> pas de liste.
// Cf. src/lib/services/coproprietes/destinataires-conseil.ts (cascade eStale -> Crypto).
//
// PII : ce module ne journalise rien ; les emails ne transitent que dans les valeurs de
// retour (jamais dans un log / un test committe avec de vraies adresses).

export type TypeListe = "conseil_syndical" | "proprietaires" | "autre";

/** Une ligne du CSV listes_diffusion (colonnes parsees, emails eclates par virgule). */
export interface LigneListeDiffusion {
  idref: string;
  designation: string;
  gestionnaire: string;
  /** Code immeuble Crypto (ex "ACACIAS") : nom court interne, PAS notre reference S###. */
  immeubleCode: string;
  immeubleVille: string;
  /** Colonne type_liste brute du CSV (0/2...). NON discriminante (cf. classifierListe). */
  typeListeBrut: string;
  a: string[];
  cc: string[];
  cci: string[];
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalise une reference copro : "S046" / "s 46 " -> "S46" (prefixe lettre + nombre
 *  sans zeros de tete). Meme regle que l'adapter eStale (references font foi). */
export function normaliserRefCopro(ref: string): string {
  const m = ref.trim().toUpperCase().match(/^([A-Z]+)0*(\d+)$/);
  return m ? `${m[1]}${m[2]}` : ref.trim().toUpperCase();
}

/**
 * Classe une liste d'apres sa DESIGNATION (le libelle fait foi). REGLE : la colonne
 * type_liste n'est PAS fiable (les listes "Conseil Syndical - Sxxx" sont taguees 0 OU 2
 * dans l'export, sans logique) ; seul le libelle "Conseil syndical" distingue de maniere
 * sure. "proprietaires" -> liste large de coproprietaires (pas le CS). Le reste (listes
 * internes cabinet, sans reference) -> "autre".
 */
export function classifierListe(designation: string): TypeListe {
  const d = designation.toLowerCase();
  if (d.includes("conseil syndic")) return "conseil_syndical";
  if (d.includes("propri")) return "proprietaires";
  return "autre";
}

/**
 * Reference copro embarquee dans la designation, normalisee : "Conseil Syndical - S046"
 * -> "S46". C'est la CLE DE RAPPROCHEMENT liste <-> copro (la reference S### est explicite
 * dans le nom de la liste, bien plus fiable que immeuble_code qui est un nom court Crypto).
 * null si aucune reference n'apparait (rapprochement impossible -> on ne pre-remplit pas).
 */
export function extraireRefCopro(designation: string): string | null {
  const m = designation.match(/\bS\s?0*\d+\b/i);
  if (!m) return null;
  return normaliserRefCopro(m[0].replace(/\s+/g, ""));
}

/** Un email interne REAL31 (collaborateur du cabinet) ? Exclu du pre-remplissage : un
 *  mail au conseil part vers les membres (coproprietaires), pas vers les collegues. */
export function estEmailInterne(email: string): boolean {
  return email.trim().toLowerCase().endsWith("@real31.fr");
}

/**
 * Destinataires exploitables d'une liste : fusion a + cc + cci, adresses bien formees
 * seulement, internes REAL31 exclus, dedupliquees (insensible a la casse), ordre stable.
 */
export function destinatairesListe(ligne: { a: string[]; cc: string[]; cci: string[] }): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  for (const brut of [...ligne.a, ...ligne.cc, ...ligne.cci]) {
    const e = brut.trim();
    const cle = e.toLowerCase();
    if (!e || !RE_EMAIL.test(e) || estEmailInterne(e) || vus.has(cle)) continue;
    vus.add(cle);
    out.push(e);
  }
  return out;
}

/**
 * Parse le CSV des listes de diffusion Crypto (separateur ';', BOM UTF-8 possible, emails
 * separes par ',' dans a/cc/cci). Le split sur ';' est sur : aucun champ ne contient de
 * ';' (les emails sont separes par des virgules). Ignore l'entete et les lignes vides.
 */
export function parseListesDiffusion(csv: string): LigneListeDiffusion[] {
  const texte = csv.replace(/^﻿/, ""); // retire un BOM UTF-8 eventuel
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lignes.length <= 1) return [];
  lignes.shift(); // entete
  const emails = (champ: string | undefined) =>
    (champ ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  return lignes.map((l) => {
    const c = l.split(";");
    return {
      idref: (c[0] ?? "").trim(),
      designation: (c[1] ?? "").trim(),
      gestionnaire: (c[2] ?? "").trim(),
      immeubleCode: (c[3] ?? "").trim(),
      immeubleVille: (c[4] ?? "").trim(),
      typeListeBrut: (c[5] ?? "").trim(),
      a: emails(c[7]),
      cc: emails(c[8]),
      cci: emails(c[9]),
    };
  });
}
