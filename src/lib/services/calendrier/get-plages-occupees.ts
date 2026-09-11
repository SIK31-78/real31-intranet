// Service : les plages OCCUPEES de l'agenda Outlook du gestionnaire, pour les afficher
// en fond du calendrier AG/CS (demande Sekou 2026-09-11, "une petite case afficher
// Outlook"). V1 volontairement free/busy : ni sujet, ni lieu, ni participant ne remontent
// (cf. le port). On repond a "quand suis-je pris ?", pas a "qu'est-ce que je fais ?".
//
// Lecture seule, best-effort : sans Graph, sans droit ou sur erreur, on renvoie [] et le
// calendrier AG/CS s'affiche exactement comme avant.
//
// Passe par le routeur (ADR-001).

import { getCalendrierOutboundProvider } from "@/lib/adapters/router";
import type { PlageOccupee } from "@/lib/ports/calendrier-outbound-provider";
import { bornerPeriodeAgenda, grouperPlagesParJour } from "@/lib/domain/agenda-occupe";
import type { JourOccupe } from "@/lib/domain/agenda-occupe";

/**
 * Plages occupees de `boite` sur la periode, regroupees par jour.
 * `duISO` / `auISO` : jours 'YYYY-MM-DD' inclus. La periode est BORNEE cote domaine :
 * getSchedule n'aime pas les fenetres larges, et une UI ne demande jamais plus que le
 * mois affiche - un appel qui deborde serait un bug, pas un besoin.
 */
export async function getPlagesOccupees(
  boite: string | undefined,
  duISO: string,
  auISO: string,
): Promise<JourOccupe[]> {
  if (!boite) return [];
  const periode = bornerPeriodeAgenda(duISO, auISO);
  if (!periode) return [];
  const plages: PlageOccupee[] = await getCalendrierOutboundProvider().plagesOccupees(
    boite,
    `${periode.du}T00:00:00`,
    // Fin EXCLUSIVE au lendemain minuit : sinon le dernier jour de la fenetre perdrait
    // tout ce qui commence apres 00:00.
    `${periode.auExclusif}T00:00:00`,
  );
  return grouperPlagesParJour(plages, periode.du, periode.au);
}
