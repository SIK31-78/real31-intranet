// Routeur d'adapters du module Reprise de copro : SEUL endroit autorise a connaitre
// un adapter concret (cf. ADR-001, hexagonal). Les pages et Server Actions passent par
// les services + ce routeur, jamais par un adapter en dur.
//
// REFONTE 2026-08 : l'extraction IA du patrimoine (Claude / Claude CLI / Mistral) est
// SUPPRIMEE du repo (git garde l'historique). Le patrimoine entre par FICHIERS EXCEL
// (adapters/xlsx/parser-xlsx), deterministe : plus de variable EXTRACTION_PROVIDER, plus
// de cle API, plus de mode "demonstration". Ce qui reste selectionne ici :
//   - extraction compta : COUCHE TEXTE uniquement (deterministe, zero reseau) ;
//   - annexes : aucun provider (l'analyse IA des annexes est debranchee) -> null ;
//   - ecriture eStale : adapter DRY-RUN par defaut, REEL derriere le double verrou
//     ESTALE_ECRITURE=reel + identifiants (ADR-030, GO/STOP humain dans l'UI) ;
//   - lecture compta eStale : REEL des que configure (lecture seule, sans danger) ;
//   - dossiers / decisions / fiches : Supabase si COPRO_SOURCE=supabase, sinon memoire.

import type { ExtractionComptaProvider } from "@/lib/reprise/ports/extraction-compta-provider";
import { CoucheTexteComptaExtractionProvider } from "@/lib/reprise/adapters/compta-extraction/couche-texte-provider";
import type { ExtractionAnnexeProvider } from "@/lib/reprise/ports/extraction-annexe-provider";
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

/**
 * Provider d'extraction du GRAND LIVRE comptable (flux de reprise COMPTA).
 *
 * COUCHE TEXTE UNIQUEMENT (deterministe, zero IA, zero reseau) : pdfjs rend le texte deja
 * positionne, parserGrandLivrePositions reconstruit les colonnes. Si le PDF est un scan,
 * l'adapter renvoie une ERREUR EXPLICITE et actionnable (redemander le PDF natif) plutot
 * que de basculer sur un pipeline OCR/IA lourd et imprevisible.
 */
export function getExtractionComptaProvider(): ExtractionComptaProvider {
  return new CoucheTexteComptaExtractionProvider();
}

/**
 * Provider d'extraction des DOCUMENTS ANNEXES (contacts + precisions) : DEBRANCHE depuis la
 * suppression des adapters IA (le seul adapter reel etait Mistral). Renvoie null : les annexes
 * versees ne sont plus analysees automatiquement (le service le note, jamais un silence). Le
 * port et son mock (tests) restent en place pour rebrancher un provider un jour, explicitement.
 */
export function getExtractionAnnexeProvider(): ExtractionAnnexeProvider | null {
  return null;
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
 * Provider de LECTURE comptable eStale (reprise). Contrairement a l'ecriture, aucun gate
 * ESTALE_ECRITURE : la lecture est sans danger (aucune mutation). On choisit donc l'adapter
 * REEL des que eStale est configure (identifiants presents), sinon le MOCK (mode
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
