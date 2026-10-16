// Vues servies par les services « Contrats & contrôles » aux écrans (REA-333). Ce fichier est
// le contrat entre les services (qui les produisent) et les composants (qui les affichent) :
// il ne porte que des types, construits sur le domaine. Dates en jours ISO "YYYY-MM-DD".

import type {
  Ascenseur,
  ContratCourant,
  Cycle,
  DevisCtq,
  DocumentContrat,
  EntreeJournalContrats,
  EtapeDef,
  NiveauQualifie,
  OffreAssurance,
  OffreGaz,
  PrestataireCopro,
  RegleRelance,
  StatutCycle,
  SujetSuivi,
} from "@/lib/domain/contrats-copro/types";
import type { ItemACompleter } from "@/lib/domain/contrats-copro/a-completer";

/** Un cycle tel qu'il se montre : le fait brut plus ce qu'on en déduit aujourd'hui. */
export interface CycleVue {
  cycle: Cycle;
  niveau: NiveauQualifie;
  progression: { franchies: number; total: number; etapeCourante: EtapeDef | null };
  /** Cycle d'amorçage jamais démarré : on le replie derrière « Démarrer le suivi ». */
  aDemarrer: boolean;
  /** Jours sans avancement depuis l'ouverture de la fenêtre (null hors fenêtre). */
  joursSansAvancement: number | null;
}

/** L'onglet « Contrats » d'une copropriété : tout ce que la fiche affiche, en une lecture. */
export interface SuiviCopro {
  coproCode: string;
  coproNom: string;
  contrat: ContratCourant;
  regles: Record<SujetSuivi, RegleRelance>;
  assurance: {
    concerne: boolean;
    courtierPartenaire: boolean;
    /** En cours d'abord, puis clos et archivés, du plus récent au plus ancien. */
    cycles: CycleVue[];
    offres: OffreAssurance[];
    documents: DocumentContrat[];
  };
  gaz: {
    concerne: boolean;
    cycles: CycleVue[];
    offres: OffreGaz[];
    documents: DocumentContrat[];
  };
  ctqAscenseur: {
    concerne: boolean;
    appareils: { ascenseur: Ascenseur; cycles: CycleVue[] }[];
    devis: DevisCtq[];
    devisRetenuId: string | null;
    documents: DocumentContrat[];
  };
  ctqVmc: {
    concerne: boolean;
    cycles: CycleVue[];
    devis: DevisCtq[];
    devisRetenuId: string | null;
    documents: DocumentContrat[];
  };
  prestataires: PrestataireCopro[];
  /** Les 30 dernières entrées, la plus récente en premier. */
  journal: EntreeJournalContrats[];
  /** Ce que l'écran peut proposer : écrire (ADR-041), déposer dans SharePoint, envoyer au CS. */
  peutEcrire: boolean;
  depotActif: boolean;
  mailActif: boolean;
  /** Pire niveau des cycles en cours, pour la pastille de l'onglet ; null si rien de qualifiable. */
  niveauGlobal: NiveauQualifie | null;
}

/** Une ligne de la liste consolidée : un cycle EN COURS, qualifié. */
export interface LigneSuivi {
  cycleId: string;
  sujet: SujetSuivi;
  coproCode: string;
  coproNom: string;
  agenceCode?: string;
  gestionnaire?: string;
  managerId?: string;
  echeanceISO: string | null;
  niveau: NiveauQualifie;
  statut: StatutCycle;
  etapeCourante: string | null;
  franchies: number;
  total: number;
  ascenseurIdentifiant?: string | null;
  aDemarrer: boolean;
  joursSansAvancement: number | null;
}

export interface CompteursSuivis {
  total: number;
  rouge: number;
  orange: number;
  vert: number;
  aCompleter: number;
  parSujet: Record<SujetSuivi, number>;
}

/** Le bloc « Échéances de contrats » de l'accueil : ce qui demande un geste sur mes copros. */
export interface EcheancesAccueil {
  rouges: LigneSuivi[];
  oranges: LigneSuivi[];
  aCompleter: number;
}

export type { ItemACompleter };

/** Les items « à compléter » groupés par copro, pour l'onglet de la liste. */
export interface ACompleterParCopro {
  coproCode: string;
  coproNom: string;
  gestionnaire?: string;
  items: ItemACompleter[];
}

/** L'auteur d'un geste, tel que les services le reçoivent de l'action (jamais un paramètre client). */
export interface AuteurContrats {
  /** public."User".id, celui de la session. */
  id: string;
  nom: string;
  email?: string;
}
