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
import { creneauCsSuggere, type CreneauCsSuggere } from "@/lib/domain/facturation/creneau-cs-suggere";

export type { CreneauCsSuggere };

/**
 * Creneau du CS de la copro a facturer : la prochaine date, sinon la derniere tenue
 * (REA-109 : la cloture de l'ODJ fait glisser la date, cf. creneauCsSuggere).
 * `undefined` si aucune date de CS n'est posee.
 */
export async function creneauCsDeLaCopro(
  coproCode: string,
  managerId: string,
): Promise<CreneauCsSuggere | undefined> {
  const copro = await getCoproRepository().findByCode(coproCode, managerId);
  if (!copro?.prochaineCsDate && !copro?.derniereCsDate) return undefined;
  const confirmation = (await getConfirmations(coproCode)).find((c) => c.type === "CS");
  return creneauCsSuggere(copro, confirmation);
}
