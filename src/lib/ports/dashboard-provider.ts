// Port (contrat) de la source de donnees du dashboard.
// Le code applicatif ne connait QUE cette interface, jamais un adapter concret.
// Cf. ADR-001. Un port ne depend que du domaine.

import type { DashboardData } from "@/lib/domain/dashboard";

export interface DashboardProvider {
  /** Renvoie l'agregat dashboard pour un gestionnaire (par son id). */
  getDashboard(gestionnaireId: string): Promise<DashboardData>;
}
