// Ordre et contenu de la liste de l'écran E-mails. Pur, sans dépendance d'infrastructure.
//
// REA-422 (27/10/2026) : l'onglet « Conclus » est retiré, la liste est « À traiter » seule
// (cf. traitesAuChargement).
//
// REA-351 (16/10/2026) : les mails des collègues (expéditeur @real31.fr) se perdent au
// milieu de ceux des copropriétaires, ou l'inverse selon la journée. On peut les
// regrouper en haut ou en bas de la liste ; dans chaque groupe, l'ordre reçu (le plus
// récent d'abord) est conservé.

import { estMailInterne } from "./tri-emails";
import type { MailEntrant } from "./mes-emails";
import type { BoiteMail } from "./boites-mail";

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

/**
 * Les mails déjà traités au chargement, absents de « À traiter » (REA-422, 27/10/2026). Boîte
 * PARTAGÉE : le statut commun « classe », posé par « Marquer traité » (le mail reste dans le
 * dossier du binôme, seul l'intranet sait qu'il est traité). Boîte PERSO : aucun, Outlook fait
 * foi. Un mail archivé a quitté la réception et n'est plus lu ; un mail qu'on y a remis
 * (glissé dans Outlook) est de nouveau à traiter, même si la base dit encore « classe ».
 * Un mail sans `boite` (fixture ancienne) est de la boîte perso.
 */
export function traitesAuChargement(
  mails: readonly Pick<MailEntrant, "id" | "boite" | "statutTraitement">[],
  boites: readonly Pick<BoiteMail, "id" | "personnelle">[],
): Set<string> {
  const partagees = new Set(boites.filter((b) => !b.personnelle).map((b) => b.id));
  return new Set(mails.filter((m) => m.statutTraitement === "classe" && m.boite !== undefined && partagees.has(m.boite)).map((m) => m.id));
}

/**
 * Le compteur d'un onglet de boîte (27/10/2026) : ses mails NON LUS encore À TRAITER. Lu = lu
 * dans Outlook ou dans l'intranet ; à traiter = ni archivé (boîte perso) ni marqué traité
 * (boîte partagée) dans cette session ou avant. La même règle pour chaque onglet : Ma boîte,
 * les boîtes partagées, la boîte d'un titulaire ouverte par délégation. 0 : rien d'affiché.
 */
export function nonLusATraiter(
  mails: readonly Pick<MailEntrant, "id" | "boite">[],
  boite: string,
  boiteParDefaut: string,
  lus: ReadonlySet<string>,
  traites: ReadonlySet<string>,
): number {
  return mails.filter((m) => (m.boite ?? boiteParDefaut) === boite && !lus.has(m.id) && !traites.has(m.id)).length;
}

/** Ce que la pastille sait d'une boîte partagée, sans lire Outlook (Supabase seulement). */
export interface ComptePartagee {
  /** Les mails distribués à mes binômes (et à ceux de mes délégations), les plus récents d'abord. */
  distribues: readonly string[];
  /** Marqués traités (statut commun « classe »). */
  traites: ReadonlySet<string>;
  /** Ouverts dans l'intranet par moi (le lu d'Outlook n'est pas en base). */
  lusIntranet: ReadonlySet<string>;
}

/**
 * La pastille rouge de l'entrée « E-mails » (27/10/2026) : le total des mails à traiter non
 * lus de mes boîtes.
 * - Boîte perso (la mienne, celle d'un titulaire par délégation) : les non lus d'Outlook dans
 *   la fenêtre que l'écran affiche (`fenetrePerso` : les 40 plus récents de la réception).
 * - Boîte partagée : les `plafondPartagee` derniers mails distribués (ceux que l'écran lit),
 *   moins ceux marqués traités, moins ceux que j'ai ouverts dans l'intranet. Le lu d'Outlook
 *   n'est pas en base : un mail lu seulement dans Outlook compte encore ici, alors que l'onglet
 *   de l'écran ne le compte plus.
 */
export function pastilleEmails(
  persos: readonly ReadonlyMap<string, boolean>[],
  partagees: readonly ComptePartagee[],
  plafondPartagee: number,
): number {
  let n = 0;
  for (const lus of persos) for (const lu of lus.values()) if (!lu) n++;
  for (const p of partagees) {
    for (const id of p.distribues.slice(0, plafondPartagee)) if (!p.traites.has(id) && !p.lusIntranet.has(id)) n++;
  }
  return n;
}
