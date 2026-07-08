// Service : definit une date d'AG ou de CS d'une copro (null = deplanifier / effacer).
// `quand` choisit la prochaine (planifiee) ou la derniere (tenue).
// Passe par le routeur (ADR-001). Le scope managerId est applique dans l'adapter.
// `boite` (email du gestionnaire connecte, passe par l'action) sert a la projection
// Outlook automatique de la prochaine date - facultatif, jamais bloquant.

import { getConfirmationEvenementRepository, getCoproRepository } from "@/lib/adapters/router";
import {
  deprojeterEvenementOutlook,
  projeterEvenementOutlook,
} from "@/lib/services/coproprietes/projeter-evenement-outlook";

export async function definirDateEvenement(
  coproCode: string,
  type: "ag" | "cs",
  quand: "prochaine" | "derniere",
  dateISO: string | null,
  managerId: string,
  boite?: string,
): Promise<void> {
  await getCoproRepository().setDateEvenement(coproCode, type, quand, dateISO, managerId);
  // (Re)poser la PROCHAINE date la propose au conseil syndical : la confirmation
  // repart "a confirmer" (demande patron). Les dates "derniere" (correction du
  // referentiel) ne sont pas concernees.
  if (quand === "prochaine") {
    const typeConfirmation = type === "ag" ? "AG" : "CS";
    if (dateISO) {
      await getConfirmationEvenementRepository().proposer(coproCode, typeConfirmation, dateISO);
      // Projection Outlook : cree l'evenement "a confirmer" ou DEPLACE l'existant
      // (replanification). Degrade propre : n'empeche jamais la pose de la date.
      await projeterEvenementOutlook(coproCode, typeConfirmation, dateISO, "a_confirmer", boite);
    } else {
      // Effacer la date : l'evenement Outlook projete n'a plus lieu d'etre.
      await deprojeterEvenementOutlook(coproCode, typeConfirmation);
    }
  }
}
