// Service : definit une date d'AG ou de CS d'une copro (null = deplanifier / effacer).
// `quand` choisit la prochaine (planifiee) ou la derniere (tenue).
// Passe par le routeur (ADR-001). Le scope managerId est applique dans l'adapter.

import { getCoproRepository } from "@/lib/adapters/router";

export async function definirDateEvenement(
  coproCode: string,
  type: "ag" | "cs",
  quand: "prochaine" | "derniere",
  dateISO: string | null,
  managerId: string,
): Promise<void> {
  return getCoproRepository().setDateEvenement(coproCode, type, quand, dateISO, managerId);
}
