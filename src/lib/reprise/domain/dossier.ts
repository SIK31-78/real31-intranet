// Modele "Dossier d'onboarding" d'une copropriété. Volontairement plus large que la
// seule reprise patrimoine : il porte tout le flux cible (offre -> reprise immeuble ->
// integration eStale -> mise en service). Le MVP n'outille que PATRIMOINE et
// VERIFICATION, mais le modele reserve deja les phases amont/aval.
//
// La nomenclature des etapes (P1..P5, V1..V4, C1..C6, cloture) reprend les fiches
// S0XXX du vault Obsidian, pour une continuite directe avec l'existant. Pur, testable.

import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";

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

/** Compteurs du dossier (alignes sur le frontmatter des fiches S0XXX). */
export interface CompteursDossier {
  nbLots?: number;
  nbCles?: number;
  nbCoproprietaires?: number;
  nbAttributions?: number;
  nbAnomalies?: number;
  nbFusionsEffectuees?: number;
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

/** Checklist par defaut d'un nouveau dossier (nomenclature des fiches S0XXX). */
export function etapesParDefaut(): Etape[] {
  const def = (code: string, phase: Phase, libelle: string): Etape => ({ code, phase, libelle, statut: "a_faire" });
  return [
    def("P1", "PATRIMOINE", "Preparation (note + PDFs sources)"),
    def("P2", "PATRIMOINE", "Cadrage (EDD, cles eStale, batiments)"),
    def("P3", "PATRIMOINE", "Production (lots / tantiemes / owners / links_DRAFT)"),
    def("P4", "PATRIMOINE", "Import eStale (ordre strict)"),
    def("P5", "PATRIMOINE", "Finalisation (coordonnees, cas particuliers)"),
    def("V1", "VERIFICATION", "Apres lots + cles + tantiemes"),
    def("V2", "VERIFICATION", "Apres owners"),
    def("V3", "VERIFICATION", "Apres links"),
    def("V4", "VERIFICATION", "Sanity check global"),
    def("C1", "COMPTABILITE", "Budget d'amorcage et comptes"),
    def("C2", "COMPTABILITE", "Fournisseurs"),
    def("C3", "COMPTABILITE", "Budget travaux (si vote)"),
    def("C4", "COMPTABILITE", "Ecritures classes 4, 5, 6"),
    def("C5", "COMPTABILITE", "Classes 1 et 7 (eclatement)"),
    def("C6", "COMPTABILITE", "Budgets definitifs et appels de fonds"),
    def("CLOTURE", "MISE_EN_SERVICE", "Cloture"),
  ];
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
