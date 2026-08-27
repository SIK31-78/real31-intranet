// Service de PRODUCTION du volet compta (processus prouve S0303) : le module PRODUIT les
// fichiers et CONTROLE - il n'ecrit JAMAIS la compta dans eStale par API. L'import se fait
// dans l'UI eStale par le gestionnaire (module Expert pour entries.xlsx, module Eclatement
// pour les classes 1/7), puis verifier-import-compta relit les soldes par LECTURE seule.
//
// Chaine (deterministe, zero reseau) :
//   1. omission des paires si la repartition N-1 est comptabilisee dans ce GL (arithmetique) ;
//   2. construction des lignes entries (domain/entries) depuis le GL + plan RESOLU ;
//   3. GENERATION du fichier entries.xlsx puis RELECTURE depuis les octets (R10) ;
//   4. batterie des 11 auto-checks sur le fichier RELU - un seul echec = pas de livraison ;
//   5. fiche d'eclatements des classes 1/7 (montant + cle par ligne, consignes metier) ;
//   6. CIBLES DE CALAGE : les soldes attendus par compte cible eStale, pour la verification
//      post-import (verifier-import-compta les confronte a la lecture eStale).

import type { JeuEcritures } from "@/lib/reprise/domain/ecriture";
import type { VerdictRaccordement } from "@/lib/reprise/domain/controle-comptes";
import type { PlanMapping } from "@/lib/reprise/domain/mapping-compta";
import { construireEntries, type ExclusionEntries, type LigneEntry } from "@/lib/reprise/domain/entries";
import {
  appliquerOmission,
  detecterPairesRepartition,
  type VerdictOmission,
} from "@/lib/reprise/domain/omission-paires";
import {
  construireFicheEclatements,
  type DetailsParCompte,
  type FicheEclatements,
} from "@/lib/reprise/domain/eclatements";
import {
  executerBatterieCompta,
  type BatterieCompta,
} from "@/lib/reprise/domain/auto-checks-compta";
import {
  assemblerExerciceMultiSyndics,
  type RapportAssemblage,
  type SourceGlAssemblage,
} from "@/lib/reprise/domain/assemblage-gl";
import type { LigneRgd } from "@/lib/reprise/domain/rgd";
import { genererEntriesBuffer, parserEntries } from "@/lib/reprise/adapters/xlsx/entries-xlsx";

export interface OptionsProductionCompta {
  /** Date ISO du 1er jour de l'exercice (pose les reports a-nouveaux). */
  dateOuverture?: string;
  /** Lignes RGD (TVA classe 6 + checks 8/9). Absent -> checks non executes, jamais verts. */
  rgd?: LigneRgd[];
  /** Detail reel des eclatements (par compte source) fourni par le gestionnaire. */
  detailsEclatement?: DetailsParCompte;
  /** Compteur de lignes non reconnues par source (check n.1). */
  nonReconnues?: { source: string; nb: number }[];
  /** Verdict du controle croise N-1/N si les deux GL ont ete analyses (check n.3). */
  raccordement?: VerdictRaccordement;
}

export interface ResultatProductionCompta {
  ok: boolean;
  erreurs: string[];
  warnings: string[];
  /** Le fichier entries.xlsx genere (present seulement si ok). */
  entriesXlsx?: Uint8Array;
  /** Les lignes RELUES depuis le fichier genere (celles que la batterie a jugees). */
  lignesRelues: LigneEntry[];
  /** La batterie des 11 checks, executee sur le fichier relu. */
  batterie?: BatterieCompta;
  /** Fiche d'eclatements des classes 1/7 (saisie manuelle dans le module Eclatement). */
  fiche?: FicheEclatements;
  /** Comptes exclus du fichier (489, decisions "ignorer") - traces. */
  exclusions: ExclusionEntries[];
  /** Verdict d'omission des paires (repartition N-1 comptabilisee dans ce GL). */
  omission: VerdictOmission;
  /**
   * LE CALAGE : soldes attendus par compte cible eStale apres import du fichier (signes,
   * debit positif). La verification post-import les confronte a la lecture eStale.
   * Ne couvre PAS les classes 1/7 (module Eclatement, cf. fiche.totalSigne).
   */
  cibles: Record<string, number>;
}

function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Produit entries.xlsx + fiche d'eclatements + batterie depuis un GL extrait et un plan de
 * mapping RESOLU (decisions humaines appliquees). AUCUNE ecriture eStale, aucun reseau.
 */
export async function produireCompta(
  gl: JeuEcritures,
  plan: PlanMapping,
  options: OptionsProductionCompta = {},
): Promise<ResultatProductionCompta> {
  const controles = gl.controles ?? [];

  // 1. Omission des paires : detectee sur CE grand livre, appliquee seulement si TOUS les
  // comptes de classe 6 s'annulent au centime (garde stricte du domaine).
  const omission = detecterPairesRepartition(gl.lignes, controles);
  const apres = appliquerOmission(gl.lignes, controles, omission);

  // 2. Construction des lignes du fichier.
  const construction = construireEntries(apres.lignes, apres.controles, plan, {
    ...(options.dateOuverture ? { dateOuverture: options.dateOuverture } : {}),
    ...(options.rgd ? { rgd: options.rgd } : {}),
  });
  if (!construction.ok) {
    return {
      ok: false,
      erreurs: construction.erreurs,
      warnings: construction.warnings,
      lignesRelues: [],
      exclusions: construction.exclusions,
      omission,
      cibles: {},
    };
  }

  // 3. Generation PUIS relecture : la batterie juge LE FICHIER, pas la structure en memoire.
  const entriesXlsx = await genererEntriesBuffer(construction.lignes);
  const relu = await parserEntries(entriesXlsx);
  if (!relu.ok) {
    return {
      ok: false,
      erreurs: [`Relecture du fichier genere impossible (bug de generation a corriger) : ${relu.erreurs[0] ?? "?"}`],
      warnings: construction.warnings,
      lignesRelues: [],
      exclusions: construction.exclusions,
      omission,
      cibles: {},
    };
  }

  // 4. La batterie des 11 checks.
  const batterie = executerBatterieCompta({
    nonReconnues: options.nonReconnues ?? [],
    gl: { lignes: apres.lignes, controles: apres.controles },
    ...(options.raccordement ? { raccordement: options.raccordement } : {}),
    omission,
    plan,
    entriesRelues: relu.lignes,
    ...(options.rgd ? { rgd: options.rgd } : {}),
  });

  // 5. Fiche d'eclatements des comptes routes hors entries (classes 1/7 et 2/3).
  const fiche = construireFicheEclatements(
    apres.lignes,
    apres.controles,
    construction.versEclatement,
    options.detailsEclatement ?? {},
    gl.intitules ?? {},
  );

  // 6. Cibles de calage par compte cible (depuis le fichier RELU, signees).
  const cibles: Record<string, number> = {};
  for (const l of relu.lignes) {
    cibles[l.compte] = arrondi((cibles[l.compte] ?? 0) + (l.type === "debit" ? l.montantTTC : -l.montantTTC));
  }

  return {
    ok: batterie.ok,
    erreurs: batterie.ok
      ? []
      : batterie.checks
          .filter((c) => c.statut === "echec")
          .map((c) => `Auto-check ${c.numero} (${c.code}) en echec : ${c.details[0] ?? c.libelle}`),
    warnings: [...construction.warnings, ...fiche.warnings, ...omission.notes],
    entriesXlsx,
    lignesRelues: relu.lignes,
    batterie,
    fiche,
    exclusions: construction.exclusions,
    omission,
    cibles,
  };
}

/** Resultat de la production multi-sources : la production + le rapport d'assemblage. */
export interface ResultatProductionMultiSources extends ResultatProductionCompta {
  /** Ce que l'assemblage a omis (reports des successeurs) et ce que dit le raccord par classe. */
  assemblage: RapportAssemblage;
}

/**
 * Produit le volet compta d'UN exercice couvert par PLUSIEURS syndics (sources ordonnees,
 * predecesseur d'abord). L'assemblage omet les reports d'ouverture des successeurs (ils
 * resument la periode dont on reprend le detail - sinon double comptage, Partie 12 du
 * skill), confronte chaque jonction PAR CLASSE, puis delegue a produireCompta. Le rapport
 * d'assemblage accompagne le resultat et ses notes rejoignent les warnings : l'omission
 * n'est JAMAIS silencieuse.
 */
export async function produireComptaMultiSources(
  sources: SourceGlAssemblage[],
  plan: PlanMapping,
  options: OptionsProductionCompta = {},
): Promise<ResultatProductionMultiSources> {
  const { jeu, rapport } = assemblerExerciceMultiSyndics(sources);
  const resultat = await produireCompta(jeu, plan, options);
  return {
    ...resultat,
    warnings: [...resultat.warnings, ...rapport.notes],
    assemblage: rapport,
  };
}
