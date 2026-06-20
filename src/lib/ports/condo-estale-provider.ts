// Port (contrat) des donnees copro sourcees Estale : Conseil Syndical, historique
// des AG, conformite (Estale Council / Meeting / CondoServiceBook). Branche en J4 ;
// mocke d'ici la. Port distinct du referentiel (CoproRepository) car les deux sources
// se branchent a des moments differents. Ne depend que du domaine.

import type { DonneesEstaleCopro } from "@/lib/domain/copropriete";

export interface CondoEstaleProvider {
  /** Donnees Estale d'une copro, ou null si la copro n'est pas (encore) sur Estale. */
  getDonneesCopro(code: string): Promise<DonneesEstaleCopro | null>;
}
