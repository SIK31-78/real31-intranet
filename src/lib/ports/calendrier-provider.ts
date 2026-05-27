// Port (contrat) de la source d'evenements AG/CS.
// Ne depend que du domaine.

import type { Evenement } from "@/lib/domain/calendrier";

export interface CalendrierProvider {
  /** Renvoie les evenements AG/CS du portefeuille d'un gestionnaire. */
  getEvenements(gestionnaireId: string): Promise<Evenement[]>;
}
