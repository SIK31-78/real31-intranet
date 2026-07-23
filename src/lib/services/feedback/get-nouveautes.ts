// Service : compose la vitrine publique /nouveautes. DEUX groupes, RIEN d'interne -
// chaque entree passe par la projection publique du domaine (ni auteur, ni description,
// ni note). Degrade proprement en vitrine vide si la table n'existe pas encore.

import { getFeedbackRepository } from "@/lib/adapters/router";
import { FeedbackNonConfigureError, versEntreePublique, type EntreePublique, type Feedback } from "@/lib/domain/feedback";

export interface Nouveautes {
  /** `prevu` + `en_cours`, triees par priorite (puis plus recent). */
  aVenir: EntreePublique[];
  /** `livre`, antechronologique par livreAt (le dernier livre en tete). */
  livre: EntreePublique[];
}

/** Priorite d'abord (absente = repoussee en fin), puis plus recent. */
function parPriorite(a: Feedback, b: Feedback): number {
  const pa = a.priorite ?? Number.POSITIVE_INFINITY;
  const pb = b.priorite ?? Number.POSITIVE_INFINITY;
  if (pa !== pb) return pa - pb;
  return b.createdAt.localeCompare(a.createdAt);
}

function parLivraisonDesc(a: Feedback, b: Feedback): number {
  return (b.livreAt ?? "").localeCompare(a.livreAt ?? "");
}

export async function getNouveautes(): Promise<Nouveautes> {
  let publics: Feedback[] = [];
  try {
    // Le port borne DEJA aux statuts publics (prevu/en_cours/livre) ; on ne fait que grouper.
    publics = await getFeedbackRepository().listerPublic();
  } catch (e) {
    if (e instanceof FeedbackNonConfigureError) return { aVenir: [], livre: [] };
    throw e;
  }

  const aVenir = publics
    .filter((f) => f.statut === "prevu" || f.statut === "en_cours")
    .sort(parPriorite)
    .map(versEntreePublique);

  const livre = publics
    .filter((f) => f.statut === "livre")
    .sort(parLivraisonDesc)
    .map(versEntreePublique);

  return { aVenir, livre };
}
