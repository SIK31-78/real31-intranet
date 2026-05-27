// Service applicatif du dashboard. Orchestration fine : il passe par le routeur
// pour obtenir un provider (jamais un adapter en direct) et delegue la lecture.
// Cf. ADR-001 : services -> ports + router, l'app -> services.

import type { DashboardData } from "@/lib/domain/dashboard";
import { getDashboardProvider } from "@/lib/adapters/router";

export async function getDashboard(gestionnaireId: string): Promise<DashboardData> {
  const provider = getDashboardProvider();
  return provider.getDashboard(gestionnaireId);
}
