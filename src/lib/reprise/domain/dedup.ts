// Deduplication stricte des copropriétaires (R7) : UNE entite = UNE personne.
// Le syndic sortant cree parfois "VIDAL n°1 / VIDAL n°2" pour un meme proprietaire
// multi-lots -> il faut FUSIONNER (+ warning + validation humaine). A l'inverse,
// deux entites de meme nom+prenom mais aux donnees divergentes (naissance/email)
// sont des DOUBLONS NON TRANCHABLES : on garde les deux et on signale.
//
// Ce module DETECTE et propose ; il ne fusionne pas tout seul (la fusion releve
// d'un point critique validable par l'humain, cf. CLAUDE.md vault). Pur, testable.

import type { Owner } from "./patrimoine";

/** Cle d'identite normalisee : nom + prenom, insensible casse/accents/espaces. */
export function cleIdentite(o: Owner): string {
  const norm = (s: string | undefined) =>
    (s ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // retire les diacritiques combinants
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  return `${norm(o.nom)}|${norm(o.prenom)}`;
}

export type TypeGroupe = "fusion_proposee" | "doublon_non_tranchable";

export interface GroupeDoublon {
  cle: string;
  type: TypeGroupe;
  owners: Owner[];
}

/** Adresse normalisee d'un owner, ou "" si aucune adresse n'est renseignee. */
function adresseDe(o: Owner): string {
  return [o.adrNum, o.adrVoie, o.adrCodePostal, o.adrVille]
    .filter((x) => (x ?? "").trim() !== "")
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deux owners de meme identite ont-ils des donnees compatibles (=> fusion sure) ?
 *
 * ELEMENTS DISTINCTIFS ELARGIS le 2026-07-30 (bug report S0306, cause 3). La version
 * precedente ne comparait que naissance / email / siren / pro : deux homonymes SANS ces
 * donnees ressortaient "compatibles", donc en fusion_proposee. Les deux GOUGE Isabelle de
 * S0306 (adresses et lots differents) etaient ainsi proposees a la fusion -- deux personnes
 * qu'un clic de trop aurait confondues.
 *
 * On ajoute donc :
 *   - la CIVILITE (Mme / Mlle distinguait les deux REDISSI sur la FDP) ;
 *   - l'ADRESSE (renseignee des deux cotes et differente = deux personnes) ;
 *   - les LOTS DETENUS (ensembles disjoints = deux personnes ; c'est le meme raisonnement
 *     que liaison-comptes, ou le total de tantiemes departage les homonymes).
 *
 * `lotsParOwner` est optionnel : sans lui, le critere des lots est simplement inactif (on ne
 * degrade pas le comportement des appelants qui ne l'ont pas).
 */
function donneesCompatibles(a: Owner, b: Owner, lotsParOwner?: Map<string, Set<number>>): boolean {
  const memeSiNonVide = (x?: string, y?: string) => !x || !y || x.trim() === y.trim();
  if (
    !memeSiNonVide(a.naissance, b.naissance) ||
    !memeSiNonVide(a.email, b.email) ||
    !memeSiNonVide(a.siren, b.siren) ||
    a.pro !== b.pro
  ) {
    return false;
  }
  // Civilite differente = distinctif (Mme vs Mlle sur la FDP).
  if (a.civilite !== b.civilite) return false;
  // Adresses renseignees DES DEUX COTES et differentes = deux personnes.
  const adrA = adresseDe(a);
  const adrB = adresseDe(b);
  if (adrA !== "" && adrB !== "" && adrA !== adrB) return false;
  // Lots connus des deux cotes et DISJOINTS = deux personnes (un meme proprietaire
  // multi-lots, lui, partage forcement... rien : ce sont ses lots a lui. Le signal utile
  // est l'inverse : des ensembles disjoints NON VIDES ne prouvent pas l'identite).
  const lotsA = lotsParOwner?.get(a.id);
  const lotsB = lotsParOwner?.get(b.id);
  if (lotsA && lotsB && lotsA.size > 0 && lotsB.size > 0) {
    const communs = [...lotsA].some((l) => lotsB.has(l));
    if (!communs) return false;
  }
  return true;
}

/**
 * Regroupe les owners de meme identite (nom+prenom). Pour chaque groupe de taille > 1 :
 * - donnees compatibles entre toutes les paires -> "fusion_proposee"
 * - sinon -> "doublon_non_tranchable" (garder les deux lignes, signaler).
 * Les owners uniques ne sont pas retournes.
 */
export function detecterDoublons(
  owners: Owner[],
  /**
   * Lots detenus par owner. Fourni (depuis les attributions), il permet d'utiliser les LOTS
   * comme element distinctif : deux homonymes aux lots disjoints sont deux personnes.
   * Absent, le critere est simplement inactif -- aucun appelant existant n'est degrade.
   */
  lotsParOwner?: Map<string, Set<number>>,
): GroupeDoublon[] {
  const parCle = new Map<string, Owner[]>();
  for (const o of owners) {
    const cle = cleIdentite(o);
    const liste = parCle.get(cle);
    if (liste) liste.push(o);
    else parCle.set(cle, [o]);
  }

  const groupes: GroupeDoublon[] = [];
  for (const [cle, liste] of parCle) {
    if (liste.length < 2) continue;
    const toutesCompatibles = liste.every((o, i) =>
      liste.slice(i + 1).every((autre) => donneesCompatibles(o, autre, lotsParOwner)),
    );
    groupes.push({
      cle,
      type: toutesCompatibles ? "fusion_proposee" : "doublon_non_tranchable",
      owners: liste,
    });
  }
  return groupes;
}
