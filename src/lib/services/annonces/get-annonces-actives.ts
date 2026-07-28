// Service : les annonces VISIBLES pour l'accueil DU collaborateur connecte.
// Cible (Sekou 2026-07-28) : une annonce vise tout le groupe (defaut), une ou
// plusieurs agences, ou des collaborateurs precis - la regle est le domaine pur
// `annonceVisiblePour` (union email / agence). Passe par le routeur (ADR-001).
// Degrade proprement : table absente (SQL non passe) -> aucune annonce, pas de crash.

import type { Annonce } from "@/lib/domain/annonce";
import { AnnoncesNonConfigureError, annonceVisiblePour } from "@/lib/domain/annonce";
import { getAnnonceRepository } from "@/lib/adapters/router";
import { codeAgence } from "@/lib/services/agences/resoudre-agence";

/** Le lecteur : email + agence (id technique, resolue ici en code ML/LGC/HLS/ASN). */
export interface LecteurAnnonces {
  email?: string | null;
  agencyId?: string | null;
}

export async function getAnnoncesActives(lecteur?: LecteurAnnonces): Promise<Annonce[]> {
  let actives: Annonce[];
  try {
    actives = await getAnnonceRepository().listerActives();
  } catch (e) {
    if (e instanceof AnnoncesNonConfigureError) return [];
    throw e;
  }
  // Sans lecteur (appel technique) : seulement les annonces "tout le groupe".
  const agence = await codeAgence(lecteur?.agencyId);
  return actives.filter((a) => annonceVisiblePour(a, lecteur?.email, agence));
}
