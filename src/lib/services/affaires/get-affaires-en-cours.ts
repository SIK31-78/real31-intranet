// Service du bloc "Mes affaires en cours" de l'accueil affaires (variante C).
//
// Cloisonne : REUTILISE getDossiers(managerId) -> ne sort que les dossiers des copros du
// gestionnaire. On exclut les dossiers CLOS (l'accueil = le travail en cours, pas l'archive)
// et on calcule le SEGMENT de chaque affaire (a_traiter / en_cours / a_clore) via le
// derivateur pur du domaine (dossier.segmentAffaire). Tri par defaut : plus recent d'abord.
//
// Le toggle [Moi]/[Tout] et les filtres copro/type sont appliques cote UI (donnees deja
// chargees, filtrage trivial) - le service livre l'ensemble du perimetre cloisonne.

import { getDossiers } from "@/lib/services/dossiers/get-dossiers";
import { segmentAffaire, type Dossier, type SegmentAffaire } from "@/lib/domain/dossier";

export interface AffaireEnCours {
  dossier: Dossier;
  segment: SegmentAffaire;
}

/** Affaires (dossiers non clos) du gestionnaire + leur segment, recent en premier. */
export async function getAffairesEnCours(managerId: string): Promise<AffaireEnCours[]> {
  const dossiers = await getDossiers(managerId);
  return dossiers
    .filter((d) => d.statut !== "clos")
    .sort((a, b) => b.ouvertLe.localeCompare(a.ouvertLe))
    .map((dossier) => ({ dossier, segment: segmentAffaire(dossier) }));
}
