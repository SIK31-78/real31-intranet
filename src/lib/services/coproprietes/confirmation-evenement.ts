// Service : confirmation des dates de CS / AG (date provisoire proposee au conseil
// syndical, puis confirmee au retour de mail). Passe par le routeur (ADR-001).

import type { ConfirmationEvenement } from "@/lib/domain/confirmation-evenement";
import { getConfirmationEvenementRepository, getCoproRepository } from "@/lib/adapters/router";
import { projeterEvenementOutlook } from "@/lib/services/coproprietes/projeter-evenement-outlook";
import { projeterCreneauxAg } from "@/lib/services/coproprietes/projeter-creneaux-ag";

/** Confirmations (AG et CS) d'une copro - pour la fiche. */
export async function getConfirmations(coproCode: string): Promise<ConfirmationEvenement[]> {
  return getConfirmationEvenementRepository().get(coproCode);
}

/** Confirmations d'un lot de copros (lecture batch) - pour le calendrier. */
export async function getConfirmationsPourCopros(
  codes: string[],
): Promise<ConfirmationEvenement[]> {
  return getConfirmationEvenementRepository().getPourCopros(codes);
}

/**
 * Confirme la PROCHAINE date AG/CS de la copro : le conseil syndical a valide par
 * retour de mail. La date confirmee est RELUE dans le referentiel cote serveur
 * (jamais prise du client) : si elle a change entre-temps, on confirme la vraie.
 * Renvoie la date confirmee, ou null si la copro est hors scope / sans date.
 * `boite` (email du gestionnaire connecte, passe par l'action) sert a la projection
 * Outlook : l'evenement projete est renomme "confirmee" - facultatif, jamais bloquant.
 */
export async function confirmerEvenement(
  coproCode: string,
  type: "AG" | "CS",
  par: string,
  managerId: string,
  boite?: string,
  heureFin?: string,
): Promise<string | null> {
  const copro = await getCoproRepository().findByCode(coproCode, managerId);
  if (!copro) return null;
  const date = type === "AG" ? copro.prochaineAg?.date : copro.prochaineCsDate;
  if (!date) return null;
  // La confirmation porte sur le JOUR : on stocke / renvoie la date pure (inchange).
  await getConfirmationEvenementRepository().confirmer(coproCode, type, date, par);
  // Heure de FIN reelle (CS uniquement, saisie au moment de la confirmation) : elle
  // alimentera la facturation du depassement d'honoraires depuis la supervision.
  // UPDATE separe et degrade propre : si la colonne n'est pas deployee, la confirmation
  // reste acquise, seul le pre-remplissage de la facturation manquera.
  if (heureFin) await getConfirmationEvenementRepository().enregistrerHeureFin(coproCode, type, heureFin);
  // Projection Outlook : recompose date + heure eventuelle pour garder l'evenement
  // timed (l'heure vit dans le referentiel, pas dans la table confirmation).
  const heure = type === "AG" ? copro.prochaineAg?.heure : copro.prochaineCsHeure;
  const debut = heure ? `${date}T${heure}:00` : date;
  // Renomme l'evenement projete ("a confirmer" -> "confirmee"). Degrade propre :
  // n'empeche jamais la confirmation intranet.
  await projeterEvenementOutlook(coproCode, type, debut, "confirme", boite);
  // Creneaux derives (AG uniquement) : la date relue est la vraie -> on re-projette, ce
  // qui DEPLACE les memes evenements (idempotent) et rattrape une pose ou Graph avait
  // echoue. Le sujet des creneaux ne depend pas du statut de confirmation.
  if (type === "AG") await projeterCreneauxAg(coproCode, date, boite);
  return date;
}
