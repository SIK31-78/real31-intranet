// Types de VUE + libelles partages de la fiche-hub d'un dossier de reprise. Extraits de
// fiche-dossier-reprise.tsx lors de la refonte 2026-08 (decoupage : la fiche depassait
// 1 900 lignes) : les zones (patrimoine, suivi, journal) et la page serveur consomment
// ces contrats sans dependre du composant racine.

import type { Phase, StatutEtape, StatutDossier } from "@/lib/reprise/domain/dossier";
import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";
import type { RecapPatrimoine } from "@/lib/reprise/services/orchestrateur-patrimoine";
import type { AnnexeAnalysee, ContactRapproche } from "@/lib/reprise/domain/rapprochement-contacts";

export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Vue serialisable d'une etape (ce que la page server projette).
export interface EtapeVue {
  code: string;
  phase: Phase;
  libelle: string;
  statut: StatutEtape;
}

export interface PatrimoineVue {
  analyseFaite: boolean;
  nbLots: number;
  nbCles: number;
  nbCoproprietaires: number;
  nbAttributions: number;
  nbAnomalies: number;
}

// Vue serialisable d'un dossier pour la fiche-hub.
export interface DossierFicheVue {
  ref: string;
  nomUsuel: string;
  adresse?: string;
  statut: StatutDossier;
  archive: boolean;
  avancement: number; // 0..1
  etapesFaites: number;
  etapesTotal: number;
  etapes: EtapeVue[];
  anomalies: string[];
  patrimoine: PatrimoineVue;
  journal: { date: string; texte: string }[];
}

export const STATUT_DOSSIER_LABEL: Record<StatutDossier, string> = {
  offre: "Offre",
  production: "Production",
  verification: "Verification",
  comptabilite: "Comptabilite",
  finalisation: "Finalisation",
  termine: "Termine",
};

export const STATUT_DOSSIER_TON: Record<StatutDossier, "neutral" | "info" | "warn" | "ok"> = {
  offre: "neutral",
  production: "info",
  verification: "warn",
  comptabilite: "warn",
  finalisation: "info",
  termine: "ok",
};

export const PHASE_LABEL: Record<Phase, string> = {
  OFFRE: "Offre",
  PATRIMOINE: "Patrimoine",
  VERIFICATION: "Verification",
  COMPTABILITE: "Comptabilite",
  MISE_EN_SERVICE: "Mise en service",
};

// Cycle de statut au clic : a_faire -> en_cours -> fait -> ignore -> a_faire.
export const STATUT_SUIVANT: Record<StatutEtape, StatutEtape> = {
  a_faire: "en_cours",
  en_cours: "fait",
  fait: "ignore",
  ignore: "a_faire",
};

export const STATUT_ETAPE_LABEL: Record<StatutEtape, string> = {
  a_faire: "A faire",
  en_cours: "En cours",
  fait: "Fait",
  ignore: "Ignore",
};

/** Bloc annexes (contacts + metadonnees) porte par l'analyse cote client. Serialisable. */
export interface AnnexesVue {
  annexes: AnnexeAnalysee[];
  contacts: ContactRapproche[];
}

export interface Analyse {
  recap: RecapPatrimoine;
  jeu: JeuDeDonnees;
  /** Documents annexes analyses + contacts rapproches (present si des annexes ont ete fournies). */
  annexes?: AnnexesVue;
}

// Analyse rehydratee cote serveur depuis le jeu persiste (dossier.jeu). Meme forme que
// l'analyse de session : recap recalcule + jeu complet, pour injecter/produire directement.
export type AnalyseInitiale = Analyse;

