// Routeur d'adapters du module Reprise de copro : SEUL endroit autorise a connaitre
// un adapter concret (cf. ADR-001, hexagonal). Les pages et Server Actions passent par
// les services + ce routeur, jamais par un adapter en dur.
//
// Selection par environnement :
//   - extraction : Claude / Mistral si credentials presents, sinon MockExtractionProvider
//     (mode demonstration, copro canonique sans IA) - cf. modeExtraction() ;
//   - ecriture eStale : adapter DRY-RUN (aucun reseau) ; le GraphQL reel se branchera ICI ;
//   - dossiers : DossierRepositoryMemoire (RAM, non persistant) ; un adapter Supabase
//     le doublera pour la vraie persistance, sans toucher aux services ni aux composants.

import type { ExtractionProvider } from "@/lib/reprise/ports/extraction-provider";
import { MockExtractionProvider } from "@/lib/reprise/adapters/extraction/mock-extraction-provider";
import { ClaudeExtractionProvider } from "@/lib/reprise/adapters/claude/claude-extraction-provider";
import { MistralExtractionProvider } from "@/lib/reprise/adapters/mistral/mistral-extraction-provider";
import type { DossierRepository } from "@/lib/reprise/ports/dossier-repository";
import { DossierRepositoryMemoire } from "@/lib/reprise/adapters/memoire/dossier-repository-memoire";
import { DossierRepositorySupabase } from "@/lib/reprise/adapters/supabase/dossier-repository-supabase";
import type { EstaleEcritureProvider } from "@/lib/reprise/ports/estale-ecriture-provider";
import { DryRunEstaleEcritureProvider } from "@/lib/reprise/adapters/estale-ecriture/dry-run-provider";

export type ModeExtraction = "claude" | "mistral" | "mock";

/**
 * Mode d'extraction selon l'environnement. Claude si credentials (ANTHROPIC_API_KEY /
 * ANTHROPIC_AUTH_TOKEN, ou EXTRACTION_PROVIDER=claude pour un profil OAuth sur disque) ;
 * sinon Mistral si MISTRAL_API_KEY (ou EXTRACTION_PROVIDER=mistral) ; sinon mock (mode
 * demonstration). Les auto-checks deterministes rattrapent les erreurs quel que soit le moteur.
 */
export function modeExtraction(): ModeExtraction {
  const choix = (process.env.EXTRACTION_PROVIDER || "auto").toLowerCase();
  if (choix === "claude") return "claude";
  if (choix === "mistral") return "mistral";
  if (choix === "mock") return "mock";
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "claude";
  if (process.env.MISTRAL_API_KEY) return "mistral";
  return "mock";
}

/** Provider d'extraction du patrimoine, choisi selon l'environnement (cf. modeExtraction). */
export function getExtractionProvider(): ExtractionProvider {
  switch (modeExtraction()) {
    case "claude":
      return new ClaudeExtractionProvider();
    case "mistral":
      return new MistralExtractionProvider();
    default:
      return new MockExtractionProvider();
  }
}

/**
 * Provider d'ECRITURE eStale. En mode demonstration : l'adapter DRY-RUN, qui deroule le
 * plan d'injection SANS aucun reseau (IDs deterministes, journal en memoire). L'adapter
 * GraphQL reel viendra plus tard et se branchera ICI, sans toucher au service ni a l'UI.
 * Instance neuve a chaque appel (les compteurs internes du dry-run repartent a zero).
 */
export function getEstaleEcritureProvider(): EstaleEcritureProvider {
  return new DryRunEstaleEcritureProvider();
}

/**
 * true si la persistance Supabase des dossiers de reprise est active (meme convention
 * que le reste de l'intranet : COPRO_SOURCE=supabase). L'UI s'en sert pour afficher (ou
 * masquer) le bandeau "non persistant (memoire)".
 */
export function reprisePersistanceSupabase(): boolean {
  return process.env.COPRO_SOURCE === "supabase";
}

/**
 * Repository des dossiers de reprise. Supabase quand COPRO_SOURCE=supabase (persistance
 * reelle dans public.reprise_dossier de la base patron), sinon adapter memoire.
 *
 * Le repo memoire est un singleton module-level : la memoire doit survivre entre deux
 * requetes du meme process serveur (sinon un dossier cree disparaitrait au rendu suivant).
 * NON PERSISTANT : perdu au redemarrage du serveur. L'adapter Supabase, lui, est sans etat
 * (une instance neuve suffit, l'etat vit dans la base).
 */
let repoMemoire: DossierRepository | null = null;

export function getRepriseDossierRepository(): DossierRepository {
  if (reprisePersistanceSupabase()) return new DossierRepositorySupabase();
  if (!repoMemoire) repoMemoire = new DossierRepositoryMemoire();
  return repoMemoire;
}
