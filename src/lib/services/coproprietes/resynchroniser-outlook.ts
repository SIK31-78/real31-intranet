// Service : "Resynchroniser Outlook" (remontee collaborateurs : une date d'AG modifiee
// A -> B -> A, Outlook n'avait pas suivi et plus aucun geste ne permettait de rattraper
// une fois la date confirmee).
//
// Rejoue la projection de la date COURANTE (relue dans le referentiel, jamais prise du
// client) : l'evenement AG/CS lui-meme, et pour une AG ses deux creneaux derives. A la
// difference des gestes courants (poser / confirmer), l'echec n'est PAS avale : il est
// rendu a l'appelant pour que le gestionnaire sache si Outlook a suivi.
// Passe par le routeur (ADR-001).

import { statutPourDate } from "@/lib/domain/confirmation-evenement";
import { mailModuleActif } from "@/lib/domain/mail-gate";
import { getConfirmationEvenementRepository, getCoproRepository } from "@/lib/adapters/router";
import { projeterEvenementOutlookOuLever } from "@/lib/services/coproprietes/projeter-evenement-outlook";
import { projeterCreneauxAgOuLever } from "@/lib/services/coproprietes/projeter-creneaux-ag";

export type ResultatResynchro = { ok: true } | { ok: false; erreur: string };

/** Message affichable a partir d'une erreur Graph ("Graph ... 403 : ...") : on garde le
 *  code HTTP pour le diagnostic, jamais l'extrait de reponse (qui peut porter des emails). */
function messageEchec(e: unknown, quoi: string): string {
  const code = /\b([45]\d\d)\b/.exec(e instanceof Error ? e.message : "")?.[1];
  return code
    ? `Outlook a refusé la mise à jour ${quoi} (erreur ${code}). Réessayez plus tard ou prévenez l'administrateur.`
    : `Outlook n'a pas pu être mis à jour ${quoi}. Réessayez plus tard.`;
}

/**
 * Rejoue la projection Outlook de la prochaine date (copro, type) dans l'agenda `boite`
 * (email de session). `managerId` borne la lecture du referentiel (cloisonnement).
 */
export async function resynchroniserOutlook(
  coproCode: string,
  type: "AG" | "CS",
  managerId: string,
  boite: string,
): Promise<ResultatResynchro> {
  if (!mailModuleActif())
    return { ok: false, erreur: "La synchronisation Outlook n'est pas active sur cet environnement." };

  const copro = await getCoproRepository().findByCode(coproCode, managerId);
  if (!copro) return { ok: false, erreur: "Copropriété introuvable." };
  const date = type === "AG" ? copro.prochaineAg?.date : copro.prochaineCsDate;
  if (!date) return { ok: false, erreur: "Aucune date à synchroniser." };
  // Meme recomposition que la confirmation : l'heure vit dans le referentiel.
  const heure = type === "AG" ? copro.prochaineAg?.heure : copro.prochaineCsHeure;
  const debut = heure ? `${date}T${heure}:00` : date;

  // Statut applicable a CETTE date (une confirmation portant sur une autre date ne vaut pas).
  const conf = (await getConfirmationEvenementRepository().get(coproCode)).find((c) => c.type === type);
  const statut = statutPourDate(conf ?? null, date);

  try {
    await projeterEvenementOutlookOuLever(coproCode, type, debut, statut, boite);
  } catch (e) {
    console.warn(`[resynchro-outlook] evenement non resynchronise pour ${coproCode} ${type}`);
    return { ok: false, erreur: messageEchec(e, type === "AG" ? "de l'AG" : "du CS") };
  }
  if (type === "AG") {
    try {
      await projeterCreneauxAgOuLever(coproCode, date, boite);
    } catch (e) {
      console.warn(`[resynchro-outlook] creneaux non resynchronises pour ${coproCode}`);
      return { ok: false, erreur: messageEchec(e, "des créneaux de travail de l'AG") };
    }
  }
  return { ok: true };
}
