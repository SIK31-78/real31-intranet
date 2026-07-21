// Port (contrat) du recap AG : compte-rendu post-assemblee generale.
// Donnee NATIVE intranet (saisie apres l'AG, ne resynchronise jamais vers
// eStale/Crypto). Couche autonome, independante du flux supervision-ag.
//
// Le CALCUL du depassement vit dans le domaine (facturation/depassement-ag) ;
// ce port ne porte que la persistance.

export type StatutRecapAg = "nouveau" | "a_facturer" | "termine" | "erreur";

/** Un poste de travaux vote en AG. */
export interface TravauxVotes {
  /** Numero de la resolution du PV qui autorise ces travaux. */
  numeroResolution?: string;
  libelle: string;
  budget?: number;
  cleRepartition?: string;
  modalitesAppelFonds?: string;
}

export interface NouveauRecapAg {
  /** Code copro (referenceCrypto). */
  coproCode: string;
  /** Jour de l'AG, ISO "YYYY-MM-DD" (cle metier avec coproCode). */
  agDate: string;
  /** Creneau reel, en ISO complet (calcul du depassement). */
  debutAg: string;
  finAg: string;

  comptesApprouves?: boolean;
  reserves?: string;
  budgetModifie?: boolean;
  montantBudget?: number;
  pourcentageBudget?: number;
  pptVote?: boolean;
  pourcentagePpt?: number;
  montantPpt?: number;
  fondsTravaux?: boolean;
  infoComptable?: string;

  /** Depassement calcule (heures arrondies + montant TTC). */
  depassementHeures: number;
  depassementTtc: number;

  travaux: TravauxVotes[];

  /** Cycle de contrat ouvert par cette AG (null si non cree). */
  suiviContratId?: string;
  statut: StatutRecapAg;
  /** Initiales de l'auteur. */
  par?: string;
}

/** Ligne d'historique des recaps AG. */
export interface RecapAgHistorique {
  id: string;
  coproCode: string;
  agDate: string;
  statut: StatutRecapAg;
  depassementHeures: number;
  depassementTtc: number;
  nbTravaux: number;
  factureId?: string;
  par?: string;
  creeLe: string;
}

export interface RecapAgRepository {
  /** Cree le recap et ses travaux. Renvoie l'id du recap. */
  creerRecapAg(input: NouveauRecapAg): Promise<string>;
  /** Rattache la facture de depassement au recap et passe le statut. */
  rattacherFacture(recapId: string, factureId: string, statut: StatutRecapAg): Promise<void>;
  /** Existe-t-il deja un recap pour cette AG ? (unicite copro + date) */
  existeRecap(coproCode: string, agDate: string): Promise<boolean>;
  /** Historique des recaps, les plus recents d'abord. */
  listerRecapsRecents(limite?: number): Promise<RecapAgHistorique[]>;
}
