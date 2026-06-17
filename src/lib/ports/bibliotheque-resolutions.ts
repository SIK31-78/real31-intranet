// Port (contrat) de la bibliotheque de resolutions. Source = la "motion bank"
// eStale (ADR-024). L'intranet lit, ne stocke pas. Ne depend que du domaine.

import type { Resolution } from "@/lib/domain/resolution";

export interface BibliothequeResolutionsProvider {
  /** Resolutions de la bibliotheque du cabinet (niveau "etablissement" eStale). */
  listerCabinet(): Promise<Resolution[]>;
}
