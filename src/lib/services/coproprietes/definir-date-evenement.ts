// Service : definit une date d'AG ou de CS d'une copro (null = deplanifier / effacer).
// `quand` choisit la prochaine (planifiee) ou la derniere (tenue).
// Passe par le routeur (ADR-001). Le scope managerId est applique dans l'adapter.

import { getConfirmationEvenementRepository, getCoproRepository } from "@/lib/adapters/router";

export async function definirDateEvenement(
  coproCode: string,
  type: "ag" | "cs",
  quand: "prochaine" | "derniere",
  dateISO: string | null,
  managerId: string,
): Promise<void> {
  await getCoproRepository().setDateEvenement(coproCode, type, quand, dateISO, managerId);
  // (Re)poser la PROCHAINE date la propose au conseil syndical : la confirmation
  // repart "a confirmer" (demande patron). Les dates "derniere" (correction du
  // referentiel) ne sont pas concernees.
  if (quand === "prochaine" && dateISO) {
    await getConfirmationEvenementRepository().proposer(
      coproCode,
      type === "ag" ? "AG" : "CS",
      dateISO,
    );
  }
}
