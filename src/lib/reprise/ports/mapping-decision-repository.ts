// Port (contrat) de persistance des DECISIONS de revue du mapping comptable. Ne dit RIEN du
// comment (memoire ? Supabase ?). Ne depend que du domaine (DecisionEntree).
//
// Cle metier : (coproCode, compteSource). Une decision par compte source et par copro.

import type { DecisionEntree } from "@/lib/reprise/domain/decisions-mapping";

export interface MappingDecisionRepository {
  /** Toutes les decisions tranchees pour une copro (vide si aucune / table absente). */
  lister(coproCode: string): Promise<DecisionEntree[]>;
  /** Cree ou remplace la decision d'un compte source (upsert, cle = coproCode + compteSource). */
  enregistrer(coproCode: string, entree: DecisionEntree): Promise<void>;
  /** Retire la decision d'un compte source (no-op si absente). */
  supprimer(coproCode: string, compteSource: string): Promise<void>;
}
