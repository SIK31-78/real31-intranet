// Adapter memoire du MappingDecisionRepository : une Map en RAM indexee par (coproCode,
// compteSource). Sert aux tests et au mode demonstration (aucune persistance entre
// redemarrages). Double d'un adapter Supabase pour la vraie persistance.
//
// On clone en entree/sortie pour eviter les fuites de reference.

import type { DecisionEntree } from "@/lib/reprise/domain/decisions-mapping";
import type { MappingDecisionRepository } from "@/lib/reprise/ports/mapping-decision-repository";

function cle(coproCode: string, compteSource: string): string {
  return `${coproCode}::${compteSource}`;
}

export class MappingDecisionRepositoryMemoire implements MappingDecisionRepository {
  private readonly store = new Map<string, DecisionEntree>();

  async lister(coproCode: string): Promise<DecisionEntree[]> {
    const prefixe = `${coproCode}::`;
    return [...this.store.entries()]
      .filter(([k]) => k.startsWith(prefixe))
      .map(([, v]) => structuredClone(v));
  }

  async enregistrer(coproCode: string, entree: DecisionEntree): Promise<void> {
    this.store.set(cle(coproCode, entree.compteSource), structuredClone(entree));
  }

  async supprimer(coproCode: string, compteSource: string): Promise<void> {
    this.store.delete(cle(coproCode, compteSource));
  }
}
