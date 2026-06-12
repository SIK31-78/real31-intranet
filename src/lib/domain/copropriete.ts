// Domaine de la fiche copropriete 360°. Types metier purs, zero dependance technique (ADR-001).
//
// Deux origines de donnees, branchees a des moments differents :
//  - le REFERENTIEL (identite, equipe, lots, dates AG) vient de l'App A (public.Copropriete) ;
//  - le CONSEIL SYNDICAL, l'HISTORIQUE DES AG et la CONFORMITE viennent d'eStale
//    (Council / Meeting / CondoServiceBook), branches en J4.
// Ici tout est mocke ; chaque bloc se branchera sur sa source via son propre port.

import type { Evenement } from "@/lib/domain/calendrier";
import type { JalonAvecEtat } from "@/lib/domain/jalons-ag/types";

// --- Referentiel copro (source App A) -------------------------------------

/** Source de la copro. UI (ADR-003) : 'crypto' -> "Crypto", 'estale' -> "eStale". */
export type SourceCopro = "crypto" | "estale";

export type StatutCopro = "active" | "inactive";

export type RoleEquipe =
  | "gestionnaire"
  | "assistant"
  | "comptable"
  | "directeur"
  | "negociateur";

export interface Adresse {
  ligne1: string;
  ligne2?: string;
  codePostal: string;
  ville: string;
}

export interface MembreEquipe {
  initiales: string;
  nomComplet: string;
  role: RoleEquipe;
}

export type StatutProchaineAg = "planifiee" | "en_preparation" | "convoquee";

/** Prochaine AG : date + etat + lien vers la supervision (fiche prepa). */
export interface ProchaineAg {
  /** Date ISO "YYYY-MM-DD". */
  date: string;
  statut: StatutProchaineAg;
  /** Message d'alerte court, ex "Convocations a envoyer aujourd'hui". */
  alerte?: string;
  /** Id de la supervision AG liee (route /supervision-ag/[id]). */
  supervisionId?: string;
}

/** Exercice comptable affiche, ex { debut: "01/01", fin: "31/12" }. */
export interface Exercice {
  debut: string;
  fin: string;
}

export interface Copropriete {
  /** Code affiche, ex "S104" (referenceCrypto / referenceEstale cote App A). */
  code: string;
  source: SourceCopro;
  nom: string;
  adresse: Adresse;
  statut: StatutCopro;
  lotsPrincipaux: number;
  lotsAutres: number;
  exercice: Exercice;
  /** Date de prise en gestion, deja formatee, ex "mars 2018". */
  priseEnGestion: string;
  equipe: MembreEquipe[];
  /** Date de la dernière AG tenue (ISO "YYYY-MM-DD"), depuis le référentiel. */
  derniereAgDate?: string;
  prochaineAg?: ProchaineAg;
  /** Dernier / prochain conseil syndical (ISO "YYYY-MM-DD"), depuis le référentiel. */
  derniereCsDate?: string;
  prochaineCsDate?: string;
  /** PPT voté (true) / à programmer (false) ; undefined si inconnu. Référentiel. */
  pptVote?: boolean;
  /** Deep-link eStale, present uniquement si source = 'estale' (ADR-003/012 :
   *  pas de deep-link Crypto). */
  estaleDeepLink?: string;
}

// --- Donnees sourcees eStale (branchees en J4) ----------------------------

export type RoleConseil = "president" | "membre";

export interface MembreConseilSyndical {
  nomComplet: string;
  role: RoleConseil;
}

/** Une AG passee. La date vient du referentiel (lastAGDate) ; les details
 *  (presents, PV) viennent d'eStale et sont donc optionnels. */
export interface AgPassee {
  /** Date ISO "YYYY-MM-DD". */
  date: string;
  type: "AG" | "AGE";
  /** Libelle court optionnel, ex "vote ravalement facade". */
  libelle?: string;
  presents?: number;
  total?: number;
  pvDispo?: boolean;
}

export type EtatConformite = "ok" | "attention" | "ko";

export interface ItemConformite {
  libelle: string;
  etat: EtatConformite;
}

/** Un contrat fournisseur (eStale), reduit a ce que l'ODJ exploite. */
export interface ContratEstale {
  libelle: string;
  /** Categorie eStale brute, ex "ENERGY_GAS". */
  categorie: string;
  /** Bornes du contrat, ISO "YYYY-MM-DD" (fin absente si "infinity"). */
  debut?: string;
  fin?: string;
}

/** Bloc de donnees copro provenant d'eStale (CS, historique AG, conformite,
 *  + donnees alimentant l'ODJ : annee de construction, contrats, procedures). */
export interface DonneesEstaleCopro {
  conseilSyndical: MembreConseilSyndical[];
  /** Echeance des mandats CS, ex "AG 2026". */
  mandatJusqua?: string;
  /** AG passees, plus recente en premier. */
  historiqueAg: AgPassee[];
  conformite: ItemConformite[];
  /** Annee de construction (eStale `constructionDate`) -> applicabilite PPT/DPE. */
  anneeConstruction?: number;
  /** Contrats fournisseurs (gaz, electricite...) pour la gestion courante. */
  contrats?: ContratEstale[];
  /** Nombre de procedures / litiges en cours. */
  nbProcedures?: number;
  /** Budget previsionnel de l'exercice courant (budget ordinaire vote), en euros. */
  budgetPrevisionnel?: number;
  /** Total des depenses courantes de l'exercice (debit des comptes de charges), en euros. */
  depensesCourantes?: number;
  /** Depenses travaux votees (debit du compte de charges travaux, classe 67), en euros. */
  depensesTravaux?: number;
  /** Montant du fonds de travaux ALUR (compte 105) en fin d'exercice, en euros. */
  fondsTravaux?: number;
  /** Coproprietaires debiteurs (solde a ce jour > 0), tries par montant decroissant. */
  debiteurs?: DebiteurEstale[];
  /** La copro a-t-elle accepte la tenue des AG en visio (eStale `meetingVideo`). */
  agVisioAcceptee?: boolean;
}

/** Un coproprietaire debiteur (solde du compte 450 a l'exercice courant). */
export interface DebiteurEstale {
  nom: string;
  montant: number;
  /** Debit > 5% du budget annuel -> a signaler (candidat recouvrement). */
  depasse5pct: boolean;
}

// --- Agregat rendu par la fiche -------------------------------------------

export interface FicheCopro {
  copro: Copropriete;
  estale: DonneesEstaleCopro;
  /** Prochains evenements de la copro (reutilise le calendrier). */
  prochains: Evenement[];
  /** Derniere AG tenue (referentiel ou eStale), remontee pour le bloc AG. */
  derniereAg?: AgPassee;
  /** Historique des AG : detaille si eStale dispo, sinon la derniere AG du referentiel. */
  historique: AgPassee[];
  /** Conformite composee : items du referentiel (PPT) + items eStale. */
  conformite: ItemConformite[];
  /** Jalons de la prochaine AG (cibles calculees + etat) ; vide si pas d'AG a venir. */
  jalons: JalonAvecEtat[];
}

/** Libelle UI de la source (ADR-003 : 'crypto' s'affiche "Crypto"). */
export function libelleSource(source: SourceCopro): string {
  return source === "estale" ? "eStale" : "Crypto";
}
