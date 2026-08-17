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

/**
 * Marqueur "le comptable a traite ce recap". Deux colonnes sur intranet_recap_ag
 * (`traite_compta_at` / `traite_compta_par`, cf. supabase/sql/intranet_recap_ag_traitement.sql).
 *
 * A NE PAS confondre avec `notif_comptable_at`, qui trace un ENVOI DE MAIL (flow
 * NotifComptable jamais branche, et qu'on ne branchera pas : la file EST le canal).
 */
export interface TraitementComptable {
  /** Horodatage ISO du marquage ; absent = pas encore traite. */
  traiteLe?: string;
  /** Initiales de celui qui a marque traite. */
  traitePar?: string;
}

/**
 * Recap AG COMPLET : tout ce que le gestionnaire a saisi apres l'AG. C'est la note de
 * travail a partir de laquelle le comptable saisit le budget vote, le pourcentage de
 * fonds travaux et les appels de fonds des travaux votes.
 *
 * Herite de NouveauRecapAg pour que TOUT champ ajoute a la saisie ressorte
 * automatiquement en lecture : un champ saisi mais jamais relu est un piege silencieux.
 */
export interface RecapAgDetail extends NouveauRecapAg, TraitementComptable {
  id: string;
  /** Facture de depassement rattachee, si le depassement a ete facture. */
  factureId?: string;
  /** Horodatage ISO de creation du recap. */
  creeLe: string;
}

/** Ligne de la file "Recaps d'AG recus" (espace comptable). */
export interface RecapAgFileLigne extends RecapAgHistorique, TraitementComptable {}

export interface RecapAgRepository {
  /** Cree le recap et ses travaux. Renvoie l'id du recap. */
  creerRecapAg(input: NouveauRecapAg): Promise<string>;
  /** Rattache la facture de depassement au recap et passe le statut. */
  rattacherFacture(recapId: string, factureId: string, statut: StatutRecapAg): Promise<void>;
  /** Existe-t-il deja un recap pour cette AG ? (unicite copro + date) */
  existeRecap(coproCode: string, agDate: string): Promise<boolean>;
  /** Historique des recaps, les plus recents d'abord. */
  listerRecapsRecents(limite?: number): Promise<RecapAgHistorique[]>;

  // --- File comptable (le recap comme note de travail) -----------------------

  /**
   * Un recap COMPLET, travaux compris. Null si l'id est inconnu.
   *
   * Lecture PAR ID et non par (copro + date) : la cle metier existe (unique), mais l'id
   * est ce que porte deja chaque ligne de file, il tient dans une URL sans reencoder une
   * cle composite (l'intranet a deja la convention `CODE__DATE` de la supervision, et
   * melanger les deux conventions est exactement le flou de parcours qu'on retire), et
   * il reste stable si la date d'AG etait fausse et se corrige.
   */
  getRecapAg(recapId: string): Promise<RecapAgDetail | null>;

  /**
   * Recaps pour la file comptable, les plus recents d'abord, avec l'etat "traite".
   * Le cloisonnement (portefeuille / agences) est applique par le SERVICE : le port
   * ne connait ni les roles ni le perimetre.
   */
  listerRecapsPourFile(limite?: number): Promise<RecapAgFileLigne[]>;

  /**
   * Marque le recap traite (ou le remet a traiter). `par` = initiales de l'auteur.
   * Leve une erreur ACTIONNABLE tant que les colonnes de traitement n'existent pas :
   * une ecriture demandee par l'utilisateur ne doit jamais reussir a vide.
   */
  marquerTraite(recapId: string, traite: boolean, par: string): Promise<void>;
}
