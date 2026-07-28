// Domaine de la fiche copropriete 360°. Types metier purs, zero dependance technique (ADR-001).
//
// Deux origines de donnees, branchees a des moments differents :
//  - le REFERENTIEL (identite, equipe, lots, dates AG) vient de l'App A (public.Copropriete) ;
//  - le CONSEIL SYNDICAL, l'HISTORIQUE DES AG et la CONFORMITE viennent d'Estale
//    (Council / Meeting / CondoServiceBook), branches en J4.
// Ici tout est mocke ; chaque bloc se branchera sur sa source via son propre port.

import type { Evenement } from "@/lib/domain/calendrier";
import type { JalonAvecEtat } from "@/lib/domain/jalons-ag/types";
import type { CycleAg } from "@/lib/domain/cycle-ag";
import type { EtatCompta } from "@/lib/domain/compta";
import type { ModeReunion, StatutConfirmation } from "@/lib/domain/confirmation-evenement";

// --- Referentiel copro (source App A) -------------------------------------

/** Source de la copro. UI (ADR-003) : 'crypto' -> "Crypto", 'estale' -> "Estale". */
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
  /** Heure de la reunion "HH:mm" ; absente = journee entiere (retrocompatible). */
  heure?: string;
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
  /** Heure du prochain CS "HH:mm" ; absente = journee entiere (retrocompatible). */
  prochaineCsHeure?: string;
  /** PPT voté (true) / à programmer (false) ; undefined si inconnu. Référentiel. */
  pptVote?: boolean;
  /** Deep-link Estale, present uniquement si source = 'estale' (ADR-003/012 :
   *  pas de deep-link Crypto). */
  estaleDeepLink?: string;

  // --- Champs du referentiel App A exploitables SANS Estale (source = referentiel).
  //     Permettent de preparer les AG des copros pas encore sur Estale.
  /** Echeance d'assurance (ISO "YYYY-MM-DD"). */
  assuranceEcheance?: string;
  /** Echeance du mandat de syndic (ISO) -> jalon renouvellement / point ODJ. */
  mandatSyndicFin?: string;
  /** Date du dernier controle technique gaz/VMC (ISO). */
  ctqGazVmcDate?: string;
  /** Numero d'immatriculation au registre national des coproprietes (en-tete convoc). */
  immatriculation?: string;
  /** Nom officiel du syndicat des coproprietaires (en-tete convoc / ODJ). */
  nomSdc?: string;
  /** Eligible AG Connect / visio. */
  agConnect?: boolean;
  /** Lien SharePoint de la copro (deep-link depuis la fiche). */
  sharepointUrl?: string;
  /** Id de l'agence gestionnaire. */
  agenceId?: string;

  // --- Ids techniques de CLOISONNEMENT EN CODE (copros eStale live uniquement).
  //     Les copros Crypto (miroir Supabase) sont cloisonnees au niveau REQUETE SQL
  //     (`.or(filtrePerimetre)`) et ne portent donc PAS ces ids. Les copros lues en
  //     direct sur eStale n'ont pas de requete SQL a filtrer : le composite applique
  //     le cloisonnement en memoire, d'ou ces ids resolus depuis les collaborateurs
  //     eStale (public."User".id). Absents si aucun gestionnaire/assistant resolu.
  /** Id technique (public."User".id) du gestionnaire de la copro (cloisonnement eStale). */
  managerId?: string;
  /** Id technique (public."User".id) de l'assistant de la copro (cloisonnement eStale). */
  assistantId?: string;
}

// --- Donnees sourcees Estale (branchees en J4) ----------------------------

export type RoleConseil = "president" | "membre";

export interface MembreConseilSyndical {
  nomComplet: string;
  role: RoleConseil;
  /** Email du membre (Estale `owner.email`), si renseigne. Sert au pre-remplissage du
   *  mail au conseil syndical ; absent pour beaucoup de copros -> fallback liste Crypto. */
  email?: string;
}

/** Une AG passee. La date vient du referentiel (lastAGDate) ; les details
 *  (presents, PV) viennent d'Estale et sont donc optionnels. */
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

/** Un contrat fournisseur (Estale), reduit a ce que l'ODJ exploite. */
export interface ContratEstale {
  libelle: string;
  /** Categorie Estale brute, ex "ENERGY_GAS". */
  categorie: string;
  /** Bornes du contrat, ISO "YYYY-MM-DD" (fin absente si "infinity"). */
  debut?: string;
  fin?: string;
}

/** Bloc de donnees copro provenant d'Estale (CS, historique AG, conformite,
 *  + donnees alimentant l'ODJ : annee de construction, contrats, procedures). */
export interface DonneesEstaleCopro {
  conseilSyndical: MembreConseilSyndical[];
  /** Echeance des mandats CS, ex "AG 2026". */
  mandatJusqua?: string;
  /** AG passees, plus recente en premier. */
  historiqueAg: AgPassee[];
  conformite: ItemConformite[];
  /** Annee de construction (Estale `constructionDate`) -> applicabilite PPT/DPE. */
  anneeConstruction?: number;
  // --- Identite complementaire (2026-07-28) : ces 3 champs vivent normalement dans le
  //     referentiel App A, ABSENTS pour les copros eStale-only -> la fiche affichait
  //     "0 lot", "- -> -", "-". eStale les porte, on les remonte ICI (requete fiche,
  //     pas la requete liste qui est dans le chemin critique de chaque page).
  /** Lots PRINCIPAUX (usage residentiel + commercial), depuis `condo.lots`. */
  lotsPrincipaux?: number;
  /** Lots ANNEXES (parking, caves, jardins... = usage parking/other). */
  lotsAutres?: number;
  /** Exercice comptable courant (`accountingV2.periodCurrent`). */
  exercice?: Exercice;
  /** Date de PRISE EN CHARGE par le syndic, ISO (`serviceBook.mandate.signed` -
   *  c'est le libelle exact de l'UI eStale, verifie a l'ecran le 2026-07-28). */
  priseEnChargeSyndic?: string;
  /** Fin du mandat de syndic, ISO (`serviceBook.mandate.end`). */
  mandatSyndicFin?: string;
  /** Equipe du cabinet TELLE QU'eSTALE la connait (`condo.collaborators` + le
   *  gestionnaire designe par `serviceBook.mandate.managerID`). Sert quand le
   *  referentiel App A n'a pas d'equipe (copros eStale-only). */
  equipe?: MembreEquipe[];
  /** Contrats fournisseurs (gaz, electricite...) pour la gestion courante. */
  contrats?: ContratEstale[];
  /** Nombre de procedures / litiges en cours. */
  nbProcedures?: number;
  /** Budget previsionnel de l'exercice courant (budget ordinaire vote), en euros. */
  budgetPrevisionnel?: number;
  /** Total des depenses courantes de l'exercice (debit des comptes de charges), en euros. */
  depensesCourantes?: number;
  /** Travaux votes par chantier : libelle + budget appele (702) + depenses constatees (671). */
  travauxVotes?: { libelle: string; budgetVote: number; depenses: number }[];
  /** Montant du fonds de travaux ALUR (compte 105) en fin d'exercice, en euros. */
  fondsTravaux?: number;
  /** Coproprietaires debiteurs (solde a ce jour > 0), tries par montant decroissant. */
  debiteurs?: DebiteurEstale[];
  /** Consommation d'eau de l'exercice (compte 601, volume lu dans les libelles). */
  eau?: ConsommationEau;
  /** La copro a-t-elle accepte la tenue des AG en visio (Estale `meetingVideo`). */
  agVisioAcceptee?: boolean;
}

/** Un coproprietaire debiteur (solde du compte 450 a l'exercice courant). */
export interface DebiteurEstale {
  nom: string;
  montant: number;
  /** Debit > 5% du budget annuel -> a signaler (candidat recouvrement). */
  depasse5pct: boolean;
}

/** Consommation d'eau de l'exercice (compte 601). */
export interface ConsommationEau {
  /** Volume total en m3 (extrait des libelles d'ecriture, ex "... - 71m3"). */
  volume: number;
  /** Montant total paye (debit du compte 601), en euros. */
  montant: number;
  /** Prix moyen au m3 = montant / volume, en euros. */
  prixM3: number;
}

// --- Agregat rendu par la fiche -------------------------------------------

export interface FicheCopro {
  copro: Copropriete;
  estale: DonneesEstaleCopro;
  /** Prochains evenements de la copro (reutilise le calendrier). */
  prochains: Evenement[];
  /** Derniere AG tenue (referentiel ou Estale), remontee pour le bloc AG. */
  derniereAg?: AgPassee;
  /** Historique des AG : detaille si Estale dispo, sinon la derniere AG du referentiel. */
  historique: AgPassee[];
  /** Conformite composee : items du referentiel (PPT) + items Estale. */
  conformite: ItemConformite[];
  /** Jalons de la prochaine AG (cibles calculees + etat) ; vide si pas d'AG a venir. */
  jalons: JalonAvecEtat[];
  /** Vrai si Estale a echoue (panne / timeout) : les blocs Estale sont vides mais la
   *  copro EST sur Estale -> l'UI distingue "indisponible" de "non disponible". */
  estaleIndisponible?: boolean;
  /** Cycle AG de la copro (etat + etape courante + action du moment), LA source unique
   *  (domain/cycle-ag). Absent quand il n'y a rien a montrer (cycle complet hors tenue).
   *  Le stepper "Ou en est cette AG" n'affiche QUE l'action du moment (refonte S2.A). */
  cycle?: CycleAg;
  /** Etat compta de la prochaine AG (flags + fil de notes) ; absent si pas d'AG datee. */
  compta?: EtatCompta;
  /** Confirmation par le conseil syndical de la prochaine AG / du prochain CS (date
   *  proposee par mail -> a_confirmer, validee -> confirme). Absent si pas de date
   *  a venir : confirmer une date passee n'a pas de sens. */
  confirmationAg?: StatutConfirmation;
  confirmationCs?: StatutConfirmation;
  /** Salle / vehicule reserves pour la prochaine AG (room mailbox + ZOE) ; absents si
   *  rien de reserve. Affiches a cote de la date et pre-remplissent l'editeur. */
  salleAgEmail?: string;
  vehiculeAgEmail?: string;
  /** Salle / vehicule reserves pour le prochain CS. */
  salleCsEmail?: string;
  vehiculeCsEmail?: string;
  /** Mode de tenue choisi (visio / presentiel / hybride) pour la prochaine AG / le
   *  prochain CS ; absent = non precise. Affiche en badge, pre-remplit l'editeur. */
  modeAgReunion?: ModeReunion;
  modeCsReunion?: ModeReunion;
  /** Collaborateurs (collegues) associes a la prochaine AG / au prochain CS, resolus
   *  en {email, nom} ; absents si aucun. Badge discret a cote de la date + pre-selection
   *  de l'editeur. */
  collaborateursAg?: { email: string; nom: string }[];
  collaborateursCs?: { email: string; nom: string }[];
  /** Code de l'agence de la copro (ML/LGC/HLS/ASN), resolu depuis `copro.agenceId` via
   *  le referentiel Agency. Sert au cloisonnement par agence de l'editeur de date (filtre
   *  les salles proposees). Absent si la copro n'a pas d'agence / la table est indisponible
   *  -> pas de filtre (on montre tout). */
  agenceCode?: string;
}

/** Libelle UI de la source (ADR-003 : 'crypto' s'affiche "Crypto"). */
export function libelleSource(source: SourceCopro): string {
  return source === "estale" ? "Estale" : "Crypto";
}
