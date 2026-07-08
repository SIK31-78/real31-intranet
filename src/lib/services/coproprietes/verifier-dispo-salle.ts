// Service : verifie la disponibilite d'une salle (room mailbox) au creneau d'une
// reunion AG/CS, avant de la reserver. S'appuie sur getSchedule (port calendrier).
// Passe par le routeur (ADR-001). Degrade "inconnu" (jamais bloquant) : le controle
// est un CONFORT, la reservation reelle s'appuie sur l'auto-acceptation de la salle.

import { finReunion } from "@/lib/domain/reunion";
import { getCalendrierOutboundProvider } from "@/lib/adapters/router";

/**
 * Disponibilite de `salleEmail` sur le creneau (date + heure -> +2h) vue depuis la
 * `boite` du gestionnaire. Sans heure (journee entiere) on ne peut pas cadrer un
 * creneau precis : "inconnu". `coproCode` / `type` ne servent qu'a la coherence de
 * l'appelant (action + scope) - la dispo ne depend que du creneau et de la salle.
 */
export async function verifierDispoSalle(
  _coproCode: string,
  _type: "AG" | "CS",
  dateISO: string,
  heure: string,
  salleEmail: string,
  boite: string,
): Promise<"libre" | "occupee" | "inconnu"> {
  if (!dateISO || !heure || !salleEmail || !boite) return "inconnu";
  const debut = `${dateISO.slice(0, 10)}T${heure}:00`;
  const fin = finReunion(debut);
  return getCalendrierOutboundProvider().disponibiliteSalle(boite, salleEmail, debut, fin);
}
