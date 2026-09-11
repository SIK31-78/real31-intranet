"use server";

import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getPlagesOccupees } from "@/lib/services/calendrier/get-plages-occupees";
import type { JourOccupe } from "@/lib/domain/agenda-occupe";

const zJour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Plages occupees de l'agenda Outlook DU GESTIONNAIRE CONNECTE, pour la periode affichee.
 *
 * La boite interrogee vient de la SESSION, jamais d'un parametre : on ne lit l'agenda de
 * personne d'autre, et aucun client ne peut demander celui d'un collegue. Seules les
 * bornes de la periode viennent du navigateur, et elles sont bornees cote domaine.
 *
 * Appelee A LA DEMANDE (quand la case "Afficher mon agenda Outlook" est cochee) et non au
 * rendu de la page : decochee - le cas par defaut - le calendrier ne coute pas un appel
 * Microsoft de plus.
 *
 * Degrade en [] : pas de session, dates invalides, Graph indisponible ou droit manquant.
 * La case ne montre alors rien, le calendrier AG/CS s'affiche comme avant.
 */
export async function plagesOccupeesAction(duISO: string, auISO: string): Promise<JourOccupe[]> {
  if (!z.object({ du: zJour, au: zJour }).safeParse({ du: duISO, au: auISO }).success) return [];
  const g = await getGestionnaireCourant();
  if (!g?.email) return [];
  return getPlagesOccupees(g.email, duISO, auISO);
}
