// Modele "Dossier d'onboarding" d'une copropriété. Volontairement plus large que la
// seule reprise patrimoine : il porte tout le flux cible (offre -> reprise immeuble ->
// integration eStale -> mise en service). Le MVP n'outille que PATRIMOINE et
// VERIFICATION, mais le modele reserve deja les phases amont/aval.
//
// La nomenclature des etapes (P1..P5, V1..V4, C1..C6, cloture) reprend les fiches
// S0XXX du vault Obsidian, pour une continuite directe avec l'existant. Pur, testable.

import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";
import type { CompteAvantRepartition, VerdictRaccordement } from "@/lib/reprise/domain/controle-comptes";

/** Grandes phases du flux d'onboarding, dans l'ordre. */
export const PHASES = [
  "OFFRE", // prospection, mandat (placeholder MVP)
  "PATRIMOINE", // lots, cles, tantiemes, owners, links
  "VERIFICATION", // controles post-import
  "COMPTABILITE", // budgets, ecritures, balance
  "MISE_EN_SERVICE", // parametrage admin, cloture
] as const;
export type Phase = (typeof PHASES)[number];

export type StatutEtape = "a_faire" | "en_cours" | "fait" | "ignore";

/** Statut global du dossier (aligne sur le frontmatter des fiches S0XXX). */
export type StatutDossier =
  | "offre"
  | "production"
  | "verification"
  | "comptabilite"
  | "finalisation"
  | "termine";

export interface Etape {
  /** Code stable repris des fiches S0XXX (ex. "P3", "V2", "C5"). */
  code: string;
  phase: Phase;
  libelle: string;
  statut: StatutEtape;
}

/** Resume de la reprise comptable (grand livre) : present si un grand livre a ete analyse. */
export interface ComptaResume {
  /** true si le grand livre est equilibre (total debit == total credit). */
  equilibre: boolean;
  /** Ecart signe totalDebit - totalCredit. */
  ecart: number;
  /** Nombre de comptes source distincts. */
  nbComptes: number;
  /** Nombre d'ecritures extraites. */
  nbEcritures: number;
  /**
   * Comptes de classe 6/7 avec report a-nouveau non nul. Present/non vide seulement si detecte.
   * Sur le GL cloture = signature "avant repartition" (bloquant) ; sur le GL en cours = anomalie
   * (reports 6/7 doivent repartir a zero). Persiste dans le JSONB `compteurs` (ADDITIF, zero
   * migration) pour rehydrater l'alerte du recap. PII-free.
   */
  avantRepartition?: CompteAvantRepartition[];
}

/** Compteurs du dossier (alignes sur le frontmatter des fiches S0XXX). */
export interface CompteursDossier {
  nbLots?: number;
  nbCles?: number;
  nbCoproprietaires?: number;
  nbAttributions?: number;
  nbAnomalies?: number;
  nbFusionsEffectuees?: number;
  /**
   * Resume de la reprise comptable de l'exercice CLOTURE, renseigne par l'analyse unifiee (grand
   * livre fourni). Loge dans `compteurs` (JSONB deja persiste) : ADDITIF, zero migration,
   * rehydratation souple. Nom historique `compta` = TOUJOURS l'exercice cloture (retro-compat).
   */
  compta?: ComptaResume;
  /**
   * Resume de la reprise comptable de l'exercice EN COURS (present si un second grand livre a ete
   * fourni et classe). JSONB `compteurs`, ADDITIF, zero migration. Absent pour les dossiers
   * persites a un seul grand livre -> rehydratation souple. PII-free.
   */
  comptaEnCours?: ComptaResume;
  /**
   * Verdict du CONTROLE CROISE cloture <-> en cours (les a-nouveaux de l'en cours doivent egaler les
   * soldes finaux du cloture). Present si les DEUX grands livres ont ete exploites. JSONB
   * `compteurs`, ADDITIF, zero migration. PII-free (numeros + montants).
   */
  raccordement?: VerdictRaccordement;
  /**
   * Erreur d'extraction du grand livre (ex. PDF scanne / couche texte inexploitable) constatee a
   * la derniere analyse. Loge dans `compteurs` (JSONB, ADDITIF, zero migration) pour rehydrater le
   * bloc compta en erreur a l'ouverture. Efface (undefined) des qu'une extraction reussit. PII-free.
   */
  comptaErreur?: string;
}

export interface EntreeJournal {
  /** ISO date (fournie par l'appelant : pas d'horloge dans le domaine pur). */
  date: string;
  texte: string;
}

export interface Dossier {
  /** Reference eStale, ex. "S0302". */
  ref: string;
  nomUsuel: string;
  /** Adresse de l'immeuble (saisie a la creation, optionnelle). */
  adresse?: string;
  statut: StatutDossier;
  etapes: Etape[];
  compteurs: CompteursDossier;
  /** Anomalies actionnables (synthese de l'orchestrateur + saisies manuelles). */
  anomalies: string[];
  journal: EntreeJournal[];
  /**
   * Jeu de donnees extrait par l'analyse (lots / cles / tantiemes / owners / attributions).
   * Persiste pour rehydrater la fiche a l'ouverture SANS re-analyser (injection / production
   * possibles directement). Optionnel : absent tant qu'aucune analyse n'a ete lancee.
   */
  jeu?: JeuDeDonnees;
}

/**
 * CHECKLIST DE SUIVI HUMAIN = les etapes REELLES du pipeline de reprise, dans l'ordre (decision
 * Sekou : l'ancienne nomenclature P/V/C « ne colle pas au reel »). C'est un simple TABLEAU
 * EDITABLE : ajuster un libelle = modifier une ligne ci-dessous (les codes R1..R11 restent
 * stables, ne pas les renumeroter sous peine de casser la retro-compat des dossiers persistes).
 *
 * Toutes ces etapes sont MANUELLES (cochees par le gestionnaire) : une case cochee = fait ET
 * verifie. Certaines pourraient etre auto-derivees (analyse lancee, injection faite...), mais
 * chacune porte un jugement humain (cadrage verifie, GO/STOP, alerte levee, revue tranchee) qui
 * ne se capture pas de facon fiable en un booleen -> on reste sur du manuel (cf. ADR / rapport).
 */
export const ETAPES_REPRISE: ReadonlyArray<{ code: string; phase: Phase; libelle: string }> = [
  { code: "R1", phase: "PATRIMOINE", libelle: "Documents recus de l'ancien syndic (PV nomination, presence, RGDD/annexes, EDD+RCP+modificatifs, fiche synthese, grand livre N-1)" },
  { code: "R2", phase: "PATRIMOINE", libelle: "Analyse lancee + cadrage verifie (clefs, EDD, coproprietaires)" },
  { code: "R3", phase: "PATRIMOINE", libelle: "Patrimoine injecte dans eStale (GO/STOP)" },
  { code: "R4", phase: "PATRIMOINE", libelle: "Corrections manuelles eStale faites (si besoin)" },
  { code: "R5", phase: "PATRIMOINE", libelle: "Fiches de renseignements generees + envoyees (courrier/mailing)" },
  // RB1/RB2 : codes hors sequence R* volontairement (inseres apres coup, demande Sekou
  // 2026-07-16) - renumeroter R6..R11 aurait change le SENS des etats deja coches en base.
  // L'ordre d'affichage = l'ordre de CE tableau, pas les codes.
  { code: "RB1", phase: "COMPTABILITE", libelle: "Compte bancaire de la copropriete ouvert (compte separe)" },
  { code: "RB2", phase: "COMPTABILITE", libelle: "Compte bancaire synchronise sur eStale (flux bancaires actifs)" },
  { code: "R6", phase: "COMPTABILITE", libelle: "Grand livre APRES repartition recu et analyse (balance 0, alerte avant-repartition levee)" },
  // RG1 : code hors sequence R* (insere apres coup, demande Sekou 2026-07-16). L'ordre d'affichage
  // = l'ordre de CE tableau, pas les codes -> RG1 s'affiche juste apres R6, en COMPTABILITE.
  { code: "RG1", phase: "COMPTABILITE", libelle: "Grand livre de l'exercice EN COURS recu et raccorde a l'exercice clos (controle croise au centime)" },
  { code: "R7", phase: "COMPTABILITE", libelle: "Revue du mapping compta tranchee (warnings, homonymes, partis)" },
  { code: "R8", phase: "COMPTABILITE", libelle: "Comptabilite importee dans eStale (Inc. 3 - a venir)" },
  { code: "R9", phase: "COMPTABILITE", libelle: "Balance eStale verifiee (soldes conformes au grand livre)" },
  { code: "RD1", phase: "MISE_EN_SERVICE", libelle: "Documents de l'ancien syndic verses sur l'extranet eStale" },
  { code: "R10", phase: "MISE_EN_SERVICE", libelle: "Retours fiches traites (emails valides, espaces extranet ouverts)" },
  { code: "R11", phase: "MISE_EN_SERVICE", libelle: "Cloture de la reprise" },
];

/** Checklist par defaut d'un nouveau dossier = le pipeline de reprise reel (toutes a_faire). */
export function etapesParDefaut(): Etape[] {
  return ETAPES_REPRISE.map((e) => ({ ...e, statut: "a_faire" as StatutEtape }));
}

/**
 * RECONCILIATION retro-compatible des etapes d'un dossier persiste avec la checklist COURANTE.
 *
 * Des dossiers ont ete persistes avec l'ANCIENNE nomenclature (P1..P5, V1..V4, C1..C6, CLOTURE)
 * dont l'etat coche vit en JSONB. Strategie SANS PERTE et SANS remap hasardeux :
 *   - on repart de la checklist canonique (R1..R11, a_faire) ;
 *   - une etape persistee dont le code EST canonique (R*) : on reporte son statut (idempotent) ;
 *   - une ANCIENNE etape (code inconnu de la checklist courante) est PRESERVEE et affichee telle
 *     quelle UNIQUEMENT si elle porte de l'information (statut != "a_faire") -> aucun etat coche
 *     n'est perdu, aucun crash a la rehydratation. On ne DEVINE aucun mapping P/V/C -> R (ce serait
 *     un mensonge semantique) : on garde la trace brute pour l'humain.
 *   - une ancienne etape restee "a_faire" (aucune info) est abandonnee proprement.
 *
 * Idempotente : rejouee sur une liste deja canonique, elle ne fait que reporter les statuts.
 */
export function reconcilierEtapes(persistees: Etape[]): Etape[] {
  const canon = etapesParDefaut();
  const parCode = new Map(canon.map((e) => [e.code, e]));
  const legacy: Etape[] = [];
  for (const e of persistees) {
    const cible = parCode.get(e.code);
    if (cible) {
      cible.statut = e.statut;
    } else if (e.statut !== "a_faire") {
      legacy.push({ ...e });
    }
  }
  return [...canon, ...legacy];
}

/** Cree un dossier neuf en phase OFFRE/production avec la checklist par defaut. */
export function creerDossier(ref: string, nomUsuel: string, adresse?: string): Dossier {
  return {
    ref,
    nomUsuel,
    ...(adresse ? { adresse } : {}),
    statut: "production",
    etapes: etapesParDefaut(),
    compteurs: {},
    anomalies: [],
    journal: [],
  };
}

/** Avancement (0..1) = part des etapes "fait" ou "ignore" sur le total. */
export function avancement(dossier: Dossier): number {
  if (dossier.etapes.length === 0) return 0;
  const faites = dossier.etapes.filter((e) => e.statut === "fait" || e.statut === "ignore").length;
  return faites / dossier.etapes.length;
}
