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
import type { ExtractionComptaProvider } from "@/lib/reprise/ports/extraction-compta-provider";
import { MockComptaExtractionProvider } from "@/lib/reprise/adapters/compta-extraction/mock-provider";
import { CoucheTexteComptaExtractionProvider } from "@/lib/reprise/adapters/compta-extraction/couche-texte-provider";
import type { DossierRepository } from "@/lib/reprise/ports/dossier-repository";
import { DossierRepositoryMemoire } from "@/lib/reprise/adapters/memoire/dossier-repository-memoire";
import { DossierRepositorySupabase } from "@/lib/reprise/adapters/supabase/dossier-repository-supabase";
import type { MappingDecisionRepository } from "@/lib/reprise/ports/mapping-decision-repository";
import { MappingDecisionRepositoryMemoire } from "@/lib/reprise/adapters/memoire/mapping-decision-repository-memoire";
import { MappingDecisionRepositorySupabase } from "@/lib/reprise/adapters/supabase/mapping-decision-repository-supabase";
import type { EstaleEcritureProvider } from "@/lib/reprise/ports/estale-ecriture-provider";
import { DryRunEstaleEcritureProvider } from "@/lib/reprise/adapters/estale-ecriture/dry-run-provider";
import { ReelEstaleEcritureProvider } from "@/lib/reprise/adapters/estale-ecriture/reel-provider";
import type { EstaleComptaLectureProvider } from "@/lib/reprise/ports/estale-compta-lecture-provider";
import { ReelEstaleComptaLectureProvider } from "@/lib/reprise/adapters/estale-compta/reel-provider";
import { MockEstaleComptaLectureProvider } from "@/lib/reprise/adapters/estale-compta/mock-provider";
import type { FicheRenseignementsRepository } from "@/lib/reprise/ports/fiche-renseignements-repository";
import { FicheRenseignementsRepositoryMemoire } from "@/lib/reprise/adapters/memoire/fiche-renseignements-repository-memoire";
import { FicheRenseignementsRepositorySupabase } from "@/lib/reprise/adapters/supabase/fiche-renseignements-repository-supabase";
import type { EstaleFicheContactProvider } from "@/lib/reprise/ports/estale-fiche-contact-provider";
import { DryRunEstaleFicheContactProvider } from "@/lib/reprise/adapters/estale-fiche-contact/dry-run-provider";
import { ReelEstaleFicheContactProvider } from "@/lib/reprise/adapters/estale-fiche-contact/reel-provider";
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
 * Provider d'extraction du GRAND LIVRE comptable pour le flux de reprise COMPTA.
 *
 * COUCHE TEXTE UNIQUEMENT (decision Sekou : « enlever la partie IA sur le grand livre, garder
 * texte, sinon trop lourd »). Des qu'un moteur reel est configure (EXTRACTION_PROVIDER = claude
 * / claude-cli / mistral, ou credentials presents), on renvoie l'adapter COUCHE TEXTE : il lit le
 * PDF NATIF de facon deterministe (zero IA), et renvoie une ERREUR EXPLICITE si le PDF est un scan
 * plutot que de basculer sur un OCR/IA lourd. Les adapters IA (claude/mistral OCR) restent dans le
 * repo pour un usage futur explicite mais ne sont PLUS le fallback du flux compta.
 *
 * Le MOCK (grand livre fictif equilibre) reste le mode DEMONSTRATION quand aucun moteur n'est
 * configure ; comme pour le patrimoine il ne doit JAMAIS repondre a de vrais PDF en production
 * (il renverrait le jeu de demo comme s'il etait le resultat de l'analyse) -> erreur explicite.
 */
export function getExtractionComptaProvider(): ExtractionComptaProvider {
  const mode = modeExtraction();
  if (mode === "mock") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Extraction non configuree en production : poser EXTRACTION_PROVIDER + la cle correspondante (ANTHROPIC_API_KEY ou MISTRAL_API_KEY).",
      );
    }
    return new MockComptaExtractionProvider();
  }
  return new CoucheTexteComptaExtractionProvider();
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

/**
 * Repository des DECISIONS de revue du mapping comptable. Meme convention que les dossiers :
 * Supabase quand COPRO_SOURCE=supabase (public.reprise_mapping_decision de la base patron),
 * sinon adapter memoire (singleton module-level, survit entre requetes du meme process, perdu
 * au redemarrage). L'adapter Supabase est sans etat (l'etat vit dans la base).
 */
let repoDecisionsMemoire: MappingDecisionRepository | null = null;

export function getMappingDecisionRepository(): MappingDecisionRepository {
  if (reprisePersistanceSupabase()) return new MappingDecisionRepositorySupabase();
  if (!repoDecisionsMemoire) repoDecisionsMemoire = new MappingDecisionRepositoryMemoire();
  return repoDecisionsMemoire;
}

/**
 * Repository des FICHES DE RENSEIGNEMENTS. Meme convention : Supabase quand
 * COPRO_SOURCE=supabase (public.reprise_fiche_renseignements de la base patron), sinon adapter
 * memoire (singleton module-level, survit entre requetes du meme process, perdu au redemarrage).
 *
 * IMPORTANT : la route PUBLIQUE /fiche/[token] et l'ecran gestionnaire lisent la MEME fiche.
 * En memoire, le singleton garantit qu'une fiche generee cote gestionnaire soit visible cote
 * public dans le meme process. En prod (Supabase), la persistance rend ce partage trivial.
 */
let repoFichesMemoire: FicheRenseignementsRepository | null = null;

export function getFicheRenseignementsRepository(): FicheRenseignementsRepository {
  if (reprisePersistanceSupabase()) return new FicheRenseignementsRepositorySupabase();
  if (!repoFichesMemoire) repoFichesMemoire = new FicheRenseignementsRepositoryMemoire();
  return repoFichesMemoire;
}

/**
 * Provider d'ECRITURE eStale DEDIE a la fiche (mise a jour de l'email d'un owner). Meme gate
 * que le reste de l'ecriture eStale : REEL uniquement si ecritureEstaleReelle() (ESTALE_ECRITURE
 * =reel + identifiants presents), sinon DRY-RUN (defaut, aucun reseau). Instance neuve a chaque appel.
 */
export function getEstaleFicheContactProvider(): EstaleFicheContactProvider {
  if (ecritureEstaleReelle()) return new ReelEstaleFicheContactProvider();
  return new DryRunEstaleFicheContactProvider();
}
