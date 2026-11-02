// Service : les BROUILLONS de la boîte perso dans E-mails (vue « Brouillons », 02/11/2026).
// Lister, lire, envoyer tel quel, mettre à la corbeille. Un brouillon sur lequel on agit est
// toujours un brouillon que la liste montre : un id Graph pris ailleurs (un mail reçu, un
// envoyé, un brouillon d'une autre boîte) est refusé sans rien lire ni écrire. La garde de la
// boîte (la mienne, pas une boîte partagée ni celle d'un titulaire) est faite dans l'action.
// Boîte partagée : pas de vue, faute de savoir qui a créé un brouillon (Graph ne le dit pas,
// et le journal de l'intranet ne le note pas encore).

import { getMailboxProvider, getMailOutboundProvider, getRechercheMail } from "@/lib/adapters/router";
import type { EchangeTrouve } from "@/lib/domain/echanges";

/** Combien de brouillons l'écran montre : les plus récemment modifiés. */
export const BROUILLONS_AFFICHES = 30;

export function listerBrouillons(boite: string): Promise<EchangeTrouve[]> {
  return getRechercheMail().brouillons({ boite, max: BROUILLONS_AFFICHES });
}

/** Un brouillon que la liste montre, par son id Graph, ou null. */
export async function brouillonVisible(boite: string, id: string): Promise<EchangeTrouve | null> {
  return (await listerBrouillons(boite)).find((b) => b.id === id) ?? null;
}

/** Le texte d'un brouillon de la liste ; null s'il n'y est pas. */
export async function lireBrouillon(boite: string, id: string): Promise<string | null> {
  if (!(await brouillonVisible(boite, id))) return null;
  return getRechercheMail().lireCorps({ boite, id });
}

/** Envoie un brouillon de la liste tel qu'il est (destinataires, pièces jointes, signature). */
export async function envoyerBrouillonDeLaListe(boite: string, id: string): Promise<EchangeTrouve | null> {
  const b = await brouillonVisible(boite, id);
  if (!b) return null;
  await getMailOutboundProvider().envoyerBrouillon({ boite, id: b.id });
  return b;
}

/**
 * Met un brouillon de la liste à la corbeille : « Éléments supprimés » d'Outlook, réversible,
 * jamais une suppression définitive (même chemin que la corbeille de la liste, REA-340).
 */
export async function brouillonALaCorbeille(boite: string, id: string): Promise<boolean | null> {
  const b = await brouillonVisible(boite, id);
  if (!b) return null;
  const r = await getMailboxProvider().mettreALaCorbeille({ boite, internetMessageIds: [b.internetMessageId] });
  return r.deplaces.length > 0;
}
