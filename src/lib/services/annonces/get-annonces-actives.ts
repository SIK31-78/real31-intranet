// Service : les annonces VISIBLES pour l'accueil. Passe par le routeur (ADR-001).
// Degrade proprement : table absente (SQL non passe) -> aucune annonce, pas de crash.

import type { Annonce } from "@/lib/domain/annonce";
import { AnnoncesNonConfigureError } from "@/lib/domain/annonce";
import { getAnnonceRepository } from "@/lib/adapters/router";

export async function getAnnoncesActives(): Promise<Annonce[]> {
  try {
    return await getAnnonceRepository().listerActives();
  } catch (e) {
    if (e instanceof AnnoncesNonConfigureError) return [];
    throw e;
  }
}
