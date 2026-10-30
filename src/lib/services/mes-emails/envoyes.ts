// Service : les mails ENVOYÉS de la boîte affichée dans E-mails (REA-341, 16/10/2026).
// Lecture seule. Réutilise le port de recherche de l'écran « Échanges » (même lecture
// Graph, même forme de résultat). Le contrôle de la boîte est fait dans l'action.

import { getRechercheMail } from "@/lib/adapters/router";
import { envoyesDuBinome, type EchangeTrouve, type PerimetreEnvoyes } from "@/lib/domain/echanges";

/** Combien d'envoyés l'écran montre : les plus récents. */
export const ENVOYES_AFFICHES = 30;
/**
 * Boîte partagée : on lit les envoyés des 14 derniers jours, pour en garder assez une fois
 * filtrés au binôme (30/10/2026 : les 100 derniers couvraient moins de 18 h sur syndic2).
 */
export const ENVOYES_JOURS_PARTAGEE = 14;
/** Plafond de sécurité de cette lecture (l'adapter Graph borne aussi à 1 000). */
export const ENVOYES_LUS_PARTAGEE = 1000;

/**
 * Les derniers envoyés de la boîte. `perimetre` donné (boîte partagée, REA-408, complété le
 * 30/10/2026) : seulement ceux du binôme (envoyeDuBinome : conversation distribuée, ou copro
 * de son portefeuille dans l'objet), jamais ceux des autres binômes.
 */
export async function listerEnvoyes(boite: string, perimetre?: PerimetreEnvoyes, maintenant: number = Date.now()): Promise<EchangeTrouve[]> {
  if (!perimetre) return getRechercheMail().envoyes({ boite, max: ENVOYES_AFFICHES });
  if (perimetre.conversations.size === 0 && perimetre.references.size === 0) return [];
  const depuis = new Date(maintenant - ENVOYES_JOURS_PARTAGEE * 86_400_000).toISOString();
  const lus = await getRechercheMail().envoyes({ boite, max: ENVOYES_LUS_PARTAGEE, depuis });
  return envoyesDuBinome(lus, perimetre, ENVOYES_AFFICHES);
}

/**
 * Le texte d'un mail envoyé, par son id Graph. `perimetre` donné (boîte partagée, REA-422,
 * 27/10/2026) : seulement un mail que la liste des envoyés montre au binôme ; un id pris
 * ailleurs (réponse d'un autre binôme) rend null, sans lire le message. La liste est relue
 * (14 jours, quelques appels Graph) : un envoyé lisible est un envoyé listé, sans exception.
 */
export async function lireEnvoye(boite: string, id: string, perimetre?: PerimetreEnvoyes): Promise<string | null> {
  if (perimetre && !(await listerEnvoyes(boite, perimetre)).some((e) => e.id === id)) return null;
  return getRechercheMail().lireCorps({ boite, id });
}
