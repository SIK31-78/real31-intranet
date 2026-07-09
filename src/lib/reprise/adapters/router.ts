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
import { ClaudeCliExtractionProvider } from "@/lib/reprise/adapters/claude-cli/claude-cli-extraction-provider";
import type { DossierRepository } from "@/lib/reprise/ports/dossier-repository";
import { DossierRepositoryMemoire } from "@/lib/reprise/adapters/memoire/dossier-repository-memoire";
import { DossierRepositorySupabase } from "@/lib/reprise/adapters/supabase/dossier-repository-supabase";
import type { EstaleEcritureProvider } from "@/lib/reprise/ports/estale-ecriture-provider";
import { DryRunEstaleEcritureProvider } from "@/lib/reprise/adapters/estale-ecriture/dry-run-provider";
import { ReelEstaleEcritureProvider } from "@/lib/reprise/adapters/estale-ecriture/reel-provider";
import type { EstaleComptaLectureProvider } from "@/lib/reprise/ports/estale-compta-lecture-provider";
import { ReelEstaleComptaLectureProvider } from "@/lib/reprise/adapters/estale-compta/reel-provider";
import { MockEstaleComptaLectureProvider } from "@/lib/reprise/adapters/estale-compta/mock-provider";
import { estaleConfigure } from "@/lib/adapters/estale/client";

export type ModeExtraction = "claude" | "claude-cli" | "mistral" | "mock";

/**
 * Mode d'extraction selon l'environnement. Claude si credentials (ANTHROPIC_API_KEY /
 * ANTHROPIC_AUTH_TOKEN, ou EXTRACTION_PROVIDER=claude pour un profil OAuth sur disque) ;
 * sinon Mistral si MISTRAL_API_KEY (ou EXTRACTION_PROVIDER=mistral) ; sinon mock (mode
 * demonstration). EXTRACTION_PROVIDER=claude-cli force la CLI Claude Code (mode TEST : session
 * locale, sans cle API). Les auto-checks deterministes rattrapent les erreurs quel que soit le moteur.
 */
export function modeExtraction(): ModeExtraction {
  const choix = (process.env.EXTRACTION_PROVIDER || "auto").toLowerCase();
  if (choix === "claude-cli") return "claude-cli";
  if (choix === "claude") return "claude";
  if (choix === "mistral") return "mistral";
  if (choix === "mock") return "mock";
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "claude";
  if (process.env.MISTRAL_API_KEY) return "mistral";
  return "mock";
}

/** Provider d'extraction du patrimoine, choisi selon l'environnement (cf. modeExtraction). */
export function getExtractionProvider(): ExtractionProvider {
  const mode = modeExtraction();
  // En production, le mock ne doit JAMAIS repondre a de vrais PDF : il renverrait la
  // copro de demonstration comme si c'etait le resultat de l'analyse (donnees fausses,
  // silencieusement). On prefere une erreur explicite ; modeExtraction() continue de
  // retourner "mock" pour que les badges UI affichent l'etat reel de la config.
  if (mode === "mock" && process.env.NODE_ENV === "production") {
    throw new Error(
      "Extraction IA non configuree en production : poser EXTRACTION_PROVIDER + la cle correspondante (ANTHROPIC_API_KEY ou MISTRAL_API_KEY).",
    );
  }
  switch (mode) {
    case "claude-cli":
      return new ClaudeCliExtractionProvider();
    case "claude":
      return new ClaudeExtractionProvider();
    case "mistral":
      return new MistralExtractionProvider();
    default:
      return new MockExtractionProvider();
  }
}

/**
 * L'ecriture eStale est-elle en mode REEL ?
 *
 * DANGER : true => les injections ECRIVENT dans l'eStale de PRODUCTION du cabinet.
 * Deux conditions cumulatives (verrou volontaire) :
 *   - ESTALE_ECRITURE=reel (interrupteur d'env explicite, absent par defaut) ;
 *   - identifiants eStale presents (estaleConfigure()) : sinon aucune connexion possible.
 * Toute autre situation => DRY-RUN (defaut sur). L'UI appelle ce helper pour afficher le
 * mode et exiger une confirmation GO/STOP avant une ecriture reelle.
 */
export function ecritureEstaleReelle(): boolean {
  return process.env.ESTALE_ECRITURE === "reel" && estaleConfigure();
}

/**
 * Provider d'ECRITURE eStale. Par defaut : l'adapter DRY-RUN, qui deroule le plan
 * d'injection SANS aucun reseau (IDs deterministes, journal en memoire).
 *
 * DANGER : renvoie l'adapter REEL (ecritures en PRODUCTION) UNIQUEMENT si
 * ecritureEstaleReelle() est vrai (ESTALE_ECRITURE=reel + identifiants presents).
 * Instance neuve a chaque appel (l'etat interne repart a zero).
 */
export function getEstaleEcritureProvider(): EstaleEcritureProvider {
  if (ecritureEstaleReelle()) return new ReelEstaleEcritureProvider();
  return new DryRunEstaleEcritureProvider();
}

/**
 * Provider de LECTURE comptable eStale (reprise, increment 0). Contrairement a l'ecriture,
 * aucun gate ESTALE_ECRITURE : la lecture est sans danger (aucune mutation). On choisit donc
 * l'adapter REEL des que eStale est configure (identifiants presents), sinon le MOCK (mode
 * demonstration, copro fictive equilibree). Instance neuve a chaque appel.
 */
export function getEstaleComptaLectureProvider(): EstaleComptaLectureProvider {
  if (estaleConfigure()) return new ReelEstaleComptaLectureProvider();
  return new MockEstaleComptaLectureProvider();
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
