// Service : les mails ENVOYÉS de la boîte affichée dans E-mails (REA-341, 16/10/2026).
// Lecture seule. Réutilise le port de recherche de l'écran « Échanges » (même lecture
// Graph, même forme de résultat). Le contrôle de la boîte est fait dans l'action.

import { getRechercheMail } from "@/lib/adapters/router";
import { envoyesDuBinome, type EchangeTrouve } from "@/lib/domain/echanges";

/** Combien d'envoyés l'écran montre : les plus récents, une seule page Graph. */
export const ENVOYES_AFFICHES = 30;
/** Boîte partagée : on en lit plus, pour en garder assez une fois filtrés au binôme. */
export const ENVOYES_LUS_PARTAGEE = 100;

/**
 * Les derniers envoyés de la boîte. `conversations` donné (boîte partagée, REA-408) : seuls
 * ceux des conversations distribuées au binôme, pas ceux des autres binômes.
 */
export async function listerEnvoyes(boite: string, conversations?: ReadonlySet<string>): Promise<EchangeTrouve[]> {
  if (!conversations) return getRechercheMail().envoyes({ boite, max: ENVOYES_AFFICHES });
  if (conversations.size === 0) return [];
  const lus = await getRechercheMail().envoyes({ boite, max: ENVOYES_LUS_PARTAGEE });
  return envoyesDuBinome(lus, conversations, ENVOYES_AFFICHES);
}

export async function lireEnvoye(boite: string, id: string): Promise<string> {
  return getRechercheMail().lireCorps({ boite, id });
}
