// Cloisonnement par agence : logique PURE (domaine, ADR-001), testable offline. Sert au
// CONFORT D'AFFICHAGE (filtrage strict par defaut + debordement "Voir les autres agences")
// des collaborateurs et des salles proposes dans l'editeur de date. Ce N'EST PAS une
// barriere de securite : l'anti-injection (listes fermees cote serveur) reste seul garant
// de ce qui peut etre reellement reserve / invite (decision Sekou : le debordement doit
// pouvoir tout montrer, la validation serveur ne bornant pas par agence).
//
// La comparaison se fait sur des valeurs comparables (deux ids techniques d'agence pour
// les collaborateurs, deux codes ML/LGC/HLS/ASN pour les salles) : le module ne prejuge
// pas de la nature de l'etiquette, il compare ce qu'on lui donne.

/** Deux etiquettes d'agence designent-elles la MEME agence ? Une etiquette absente
 *  (vide / null / undefined) n'appartient a aucune agence -> jamais "meme agence". */
export function memeAgence(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return Boolean(a) && Boolean(b) && a === b;
}

/** Partition d'une liste selon l'appartenance a l'agence de reference.
 *  - `memeAgence` : les items de l'agence de reference (affiches par defaut) ;
 *  - `autres`     : le reste (revele par "Voir les autres agences").
 *  Sans reference (copro sans agence), on ne filtre PAS : tout passe en `memeAgence`
 *  (on montre tout par defaut). Un item sans etiquette tombe toujours dans `autres`
 *  quand une reference existe (il apparait au debordement, jamais par defaut). */
export function partitionnerParAgence<T>(
  items: readonly T[],
  agenceDe: (item: T) => string | null | undefined,
  agenceReference: string | null | undefined,
): { memeAgence: T[]; autres: T[] } {
  if (!agenceReference) return { memeAgence: [...items], autres: [] };
  const meme: T[] = [];
  const autres: T[] = [];
  for (const item of items) {
    if (memeAgence(agenceDe(item), agenceReference)) meme.push(item);
    else autres.push(item);
  }
  return { memeAgence: meme, autres };
}
