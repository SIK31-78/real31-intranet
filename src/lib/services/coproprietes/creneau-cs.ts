// Creneau REEL du CS preparatoire d'une copro (demande Sekou 2026-07-28) : jour + heure
// de debut (referentiel) + heure de FIN (saisie a la confirmation du CS).
//
// A quoi ca sert : le CS est facture a l'heure au-dela d'une franchise. Sans ce creneau,
// le gestionnaire doit retrouver l'horaire de memoire au moment de facturer, parfois des
// semaines apres la reunion. On le lui rend au moment ou il en a besoin.
//
// TOUT est facultatif et degrade en silence : pas de date de CS, pas de confirmation, ou
// colonne heure_fin pas encore deployee -> le formulaire garde ses valeurs par defaut.
// C'est un CONFORT de pre-remplissage, jamais une source de verite pour la facture (le
// montant est toujours recalcule depuis le bareme, cf. creer-facture-depassement-cs).
//
// Passe par le routeur (ADR-001).

import { getCoproRepository } from "@/lib/adapters/router";
import { getConfirmations } from "@/lib/services/coproprietes/confirmation-evenement";

export interface CreneauCsSuggere {
  /** Jour du CS, ISO "YYYY-MM-DD". */
  jour: string;
  /** Heure de debut "HH:mm". */
  debut: string;
  /** Heure de fin reelle "HH:mm", si elle a ete saisie a la confirmation. */
  fin?: string;
}

/**
 * Creneau du prochain CS de la copro, ou `undefined` si aucune date de CS n'est posee.
 * L'heure de fin n'est retenue que si elle correspond a CE jour-la (la confirmation porte
 * la date : si le CS a ete replanifie depuis, l'heure de fin d'une autre seance ne doit
 * pas fuiter dans la facturation).
 */
export async function creneauCsDeLaCopro(
  coproCode: string,
  managerId: string,
): Promise<CreneauCsSuggere | undefined> {
  const copro = await getCoproRepository().findByCode(coproCode, managerId);
  const jour = copro?.prochaineCsDate;
  if (!jour) return undefined;
  const debut = copro?.prochaineCsHeure ?? "";
  const confirmation = (await getConfirmations(coproCode)).find((c) => c.type === "CS");
  const fin = confirmation?.date === jour ? confirmation.heureFin : undefined;
  return { jour, debut, ...(fin ? { fin } : {}) };
}
