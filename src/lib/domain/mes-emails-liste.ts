// Ordre de la liste de l'écran E-mails. Pur, sans dépendance d'infrastructure.
//
// REA-351 (16/10/2026) : les mails des collègues (expéditeur @real31.fr) se perdent au
// milieu de ceux des copropriétaires, ou l'inverse selon la journée. On peut les
// regrouper en haut ou en bas de la liste ; dans chaque groupe, l'ordre reçu (le plus
// récent d'abord) est conservé.

import { estMailInterne } from "./tri-emails";

export type PlaceInternes = "meles" | "haut" | "bas";

export const PLACES_INTERNES: readonly PlaceInternes[] = ["meles", "haut", "bas"];

export const LIBELLE_PLACE_INTERNES: Record<PlaceInternes, string> = {
  meles: "Collègues mêlés aux autres",
  haut: "Collègues en haut",
  bas: "Collègues en bas",
};

/** La valeur lue (stockage du navigateur, URL) si elle est connue ; « mêlés » sinon. */
export function placeInternesValide(v: unknown): PlaceInternes {
  return PLACES_INTERNES.includes(v as PlaceInternes) ? (v as PlaceInternes) : "meles";
}

/**
 * Regroupe les mails internes en haut ou en bas, sans toucher à l'ordre à l'intérieur de
 * chaque groupe. `boiteDe` donne la boîte qui a reçu le mail : un mail qu'on s'envoie à
 * soi-même n'est pas « d'un collègue ».
 */
export function regrouperInternes<M extends { expediteurEmail: string }>(
  mails: readonly M[],
  place: PlaceInternes,
  boiteDe: (m: M) => string,
): M[] {
  if (place === "meles") return [...mails];
  const internes: M[] = [];
  const externes: M[] = [];
  for (const m of mails) (estMailInterne(m.expediteurEmail, boiteDe(m)) ? internes : externes).push(m);
  return place === "haut" ? [...internes, ...externes] : [...externes, ...internes];
}
