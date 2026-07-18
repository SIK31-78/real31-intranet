// Adapter memoire du FicheRenseignementsRepository : une Map en RAM indexee par
// (coproCode, ownerId), plus un index par tokenHash pour le lookup public. Sert aux tests et
// au mode demonstration (aucune persistance entre redemarrages). On clone en entree/sortie
// pour eviter les fuites de reference.

import type { FicheRenseignement } from "@/lib/reprise/domain/fiche-renseignements";
import type { FicheRenseignementsRepository } from "@/lib/reprise/ports/fiche-renseignements-repository";

function cle(coproCode: string, ownerId: string): string {
  return `${coproCode}::${ownerId}`;
}

export class FicheRenseignementsRepositoryMemoire implements FicheRenseignementsRepository {
  private readonly store = new Map<string, FicheRenseignement>();

  async listerParDossier(coproCode: string): Promise<FicheRenseignement[]> {
    const prefixe = `${coproCode}::`;
    return [...this.store.entries()]
      .filter(([k]) => k.startsWith(prefixe))
      .map(([, v]) => structuredClone(v));
  }

  async obtenirParTokenHash(tokenHash: string): Promise<FicheRenseignement | null> {
    for (const v of this.store.values()) {
      if (v.tokenHash === tokenHash) return structuredClone(v);
    }
    return null;
  }

  async sauver(fiche: FicheRenseignement): Promise<void> {
    this.store.set(cle(fiche.coproCode, fiche.ownerId), structuredClone(fiche));
  }

  async supprimerParDossier(coproCode: string): Promise<number> {
    const prefixe = `${coproCode}::`;
    let n = 0;
    for (const k of [...this.store.keys()]) {
      if (k.startsWith(prefixe)) {
        this.store.delete(k);
        n++;
      }
    }
    return n;
  }
}
