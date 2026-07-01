// Routeur d'adapters du module Reprise de copro : SEUL endroit autorise a connaitre
// un adapter concret (cf. ADR-001, hexagonal). Les pages et Server Actions passent par
// les services + ce routeur, jamais par un adapter en dur.
//
// Pour l'instant, tout est en mode DEMONSTRATION :
//   - extraction : MockExtractionProvider (copro canonique, sans IA) ; les vrais
//     adapters Claude / Mistral viendront plus tard, le choix se fera ICI ;
//   - dossiers : DossierRepositoryMemoire (RAM, non persistant entre redemarrages) ;
//     un adapter Supabase le doublera pour la vraie persistance, sans toucher aux
//     services ni aux composants.

import type { ExtractionProvider } from "@/lib/reprise/ports/extraction-provider";
import { MockExtractionProvider } from "@/lib/reprise/adapters/extraction/mock-extraction-provider";
import type { DossierRepository } from "@/lib/reprise/ports/dossier-repository";
import { DossierRepositoryMemoire } from "@/lib/reprise/adapters/memoire/dossier-repository-memoire";

/** Provider d'extraction du patrimoine (mock = mode demonstration pour l'instant). */
export function getExtractionProvider(): ExtractionProvider {
  return new MockExtractionProvider();
}

/**
 * Repository des dossiers de reprise. Singleton module-level : la memoire doit
 * survivre entre deux requetes du meme process serveur (sinon un dossier cree
 * disparaitrait au rendu suivant). NON PERSISTANT : perdu au redemarrage du serveur.
 */
let repoMemoire: DossierRepository | null = null;

export function getRepriseDossierRepository(): DossierRepository {
  if (!repoMemoire) repoMemoire = new DossierRepositoryMemoire();
  return repoMemoire;
}
