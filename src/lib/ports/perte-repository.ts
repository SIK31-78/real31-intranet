// Port du dossier de perte de copropriete. Ne depend que du domaine.

import type { DossierPerte } from "@/lib/domain/perte/dossier";

export interface PerteRepository {
  /** Tous les dossiers, les plus recents d'abord. [] si la table n'existe pas encore. */
  lister(): Promise<DossierPerte[]>;
  get(id: string): Promise<DossierPerte | null>;
  /** Le dossier ouvert (non termine) d'une copro, s'il y en a un. */
  getEnCoursPourCopro(coproCode: string): Promise<DossierPerte | null>;
  /** Cree le dossier. Leve si un dossier existe deja pour (copro, AG). */
  creer(dossier: Omit<DossierPerte, "id">): Promise<DossierPerte>;
  /** Remplace etapes, journal, statut. */
  sauver(dossier: DossierPerte): Promise<void>;
}
