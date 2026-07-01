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

/** Deux owners de meme identite ont-ils des donnees compatibles (=> fusion sure) ? */
function donneesCompatibles(a: Owner, b: Owner): boolean {
  const memeSiNonVide = (x?: string, y?: string) => !x || !y || x.trim() === y.trim();
  return (
    memeSiNonVide(a.naissance, b.naissance) &&
    memeSiNonVide(a.email, b.email) &&
    memeSiNonVide(a.siren, b.siren) &&
    a.pro === b.pro
  );
}

/**
 * Regroupe les owners de meme identite (nom+prenom). Pour chaque groupe de taille > 1 :
 * - donnees compatibles entre toutes les paires -> "fusion_proposee"
 * - sinon -> "doublon_non_tranchable" (garder les deux lignes, signaler).
 * Les owners uniques ne sont pas retournes.
 */
export function detecterDoublons(owners: Owner[]): GroupeDoublon[] {
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
      liste.slice(i + 1).every((autre) => donneesCompatibles(o, autre)),
    );
    groupes.push({
      cle,
      type: toutesCompatibles ? "fusion_proposee" : "doublon_non_tranchable",
      owners: liste,
    });
  }
  return groupes;
}
