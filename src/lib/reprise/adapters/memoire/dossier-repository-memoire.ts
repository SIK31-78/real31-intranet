// Adapter memoire du DossierRepository : une Map en RAM. Sert aux tests et au mode
// demonstration (aucune persistance entre redemarrages). Sera double d'un adapter
// Supabase pour la vraie persistance, sans toucher au domaine ni au service.
//
// On clone en entree/sortie pour eviter les fuites de reference (un appelant qui muterait
// un Dossier obtenu ne doit pas alterer le "stockage" en douce).

import type { Dossier } from "@/lib/reprise/domain/dossier";
import type { DossierRepository } from "@/lib/reprise/ports/dossier-repository";

function clone(d: Dossier): Dossier {
  return structuredClone(d);
}

export class DossierRepositoryMemoire implements DossierRepository {
  private readonly store = new Map<string, Dossier>();

  constructor(initiaux: Dossier[] = []) {
    for (const d of initiaux) this.store.set(d.ref, clone(d));
  }

  async lister(): Promise<Dossier[]> {
    return [...this.store.values()].map(clone);
  }

  async obtenir(ref: string): Promise<Dossier | null> {
    const d = this.store.get(ref);
    return d ? clone(d) : null;
  }

  async sauver(dossier: Dossier): Promise<void> {
    this.store.set(dossier.ref, clone(dossier));
  }

  async supprimer(ref: string): Promise<void> {
    this.store.delete(ref);
  }
}
