// Port (contrat) de persistance des dossiers d'onboarding. Ne dit RIEN du comment
// (memoire ? Supabase ? fichier ?). Ne depend que du domaine.

import type { Dossier } from "@/lib/reprise/domain/dossier";

export interface DossierRepository {
  /** Tous les dossiers (tri a la charge de l'appelant). */
  lister(): Promise<Dossier[]>;
  /** Un dossier par sa reference eStale, ou null s'il n'existe pas. */
  obtenir(ref: string): Promise<Dossier | null>;
  /** Cree ou remplace le dossier (upsert, cle = ref). */
  sauver(dossier: Dossier): Promise<void>;
  /** Supprime le dossier (no-op s'il n'existe pas). */
  supprimer(ref: string): Promise<void>;
}
