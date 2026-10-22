// Copros ESTALE SANS ligne dans le referentiel (public.Copropriete) : elles s'affichent dans
// l'intranet (lues en direct dans ESTALE) mais la gestion courante part du referentiel et de
// son contrat, elles ne sont donc JAMAIS facturees. Arrive a 5 copros (REA-56) puis a
// Saint-Ouen (REA-406) ; l'alerte est REA-407.
//
// Domaine PUR : la comparaison seule. Une ligne du referentiel compte quel que soit son
// statut (une copro perdue, INACTIVE, n'est pas a recreer) et sous ses deux references
// (Crypto et ESTALE), rapprochees comme partout par normaliserRef.

import { normaliserRef } from "@/lib/domain/copro-fusion";

/** Copros ESTALE qui ne sont pas a facturer : la copro de test. */
export const REFS_HORS_FACTURATION: readonly string[] = ["SE999"];

export interface CoproHorsReferentiel {
  code: string;
  nom: string;
}

/** Les copros ESTALE dont aucune reference du referentiel ne correspond, triees par code. */
export function coprosHorsReferentiel(
  estale: readonly CoproHorsReferentiel[],
  referencesReferentiel: Iterable<string>,
): CoproHorsReferentiel[] {
  const connues = new Set<string>();
  for (const ref of referencesReferentiel) connues.add(normaliserRef(ref));
  for (const ref of REFS_HORS_FACTURATION) connues.add(normaliserRef(ref));
  return estale
    .filter((c) => !connues.has(normaliserRef(c.code)))
    .map((c) => ({ code: c.code, nom: c.nom }))
    .sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }));
}
