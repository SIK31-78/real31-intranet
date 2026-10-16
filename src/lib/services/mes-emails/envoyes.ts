// Service : les mails ENVOYÉS de la boîte affichée dans E-mails (REA-341, 16/10/2026).
// Lecture seule. Réutilise le port de recherche de l'écran « Échanges » (même lecture
// Graph, même forme de résultat). Le contrôle de la boîte est fait dans l'action.

import { getRechercheMail } from "@/lib/adapters/router";
import type { EchangeTrouve } from "@/lib/domain/echanges";

/** Combien d'envoyés l'écran montre : les plus récents, une seule page Graph. */
export const ENVOYES_AFFICHES = 30;

export async function listerEnvoyes(boite: string): Promise<EchangeTrouve[]> {
  return getRechercheMail().envoyes({ boite, max: ENVOYES_AFFICHES });
}

export async function lireEnvoye(boite: string, id: string): Promise<string> {
  return getRechercheMail().lireCorps({ boite, id });
}
