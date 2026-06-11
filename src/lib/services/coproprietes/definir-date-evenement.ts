// Service : definit la prochaine date d'AG ou de CS d'une copro (null = deplanifier).
// Passe par le routeur (ADR-001). Le scope managerId est applique dans l'adapter.

import { getCoproRepository } from "@/lib/adapters/router";

export async function definirDateEvenement(
  coproCode: string,
  type: "ag" | "cs",
  dateISO: string | null,
  managerId: string,
): Promise<void> {
  return getCoproRepository().setDateEvenement(coproCode, type, dateISO, managerId);
}
