// Domaine de l'ecran "Mes emails" : cockpit de traitement des mails entrants.
// Flux par mail : reception -> analyse -> rattachement a un dossier (ou
// nouveau) -> historique du dossier -> reponse + flow d'actions proposes ->
// classement + MAJ du dossier. Types metier purs (ADR-001).
//
// Note archi : l'analyse vient d'un port (AnalyseMailProvider, a venir) ; mock
// aujourd'hui, API demain, modele local plus tard = swap d'adapter, sans toucher ici.

import type { Severite } from "@/lib/domain/commun";
import type { TypeDossier } from "@/lib/domain/dossier";

/** Ton du badge de priorite : rouge (urgent), ambre (a traiter), neutre (info). */
export type UrgenceTon = "err" | "warn" | "neutral";

export interface BadgeUrgence {
  texte: string;
  ton: UrgenceTon;
}

/** Un dossier reel de la boite Outlook (selecteur de classement du cockpit). */
export interface DossierBoite {
  id: string;
  nom: string;
  /** 0 = dossier racine de la boite, 1 = sous-dossier de la boite de reception. */
  niveau: number;
}

/** Taxonomie de tete du tri (cf. assistant-ia/src/types.ts). */
export type TypeMail =
  | "panne_intervention"
  | "sinistre_degat_eaux"
  | "demande_copro_cs"
  | "devis_validation"
  | "facture_contrat_fournisseur"
  | "comptabilite"
  | "ag_cs"
  | "vefa_reserves"
  | "non_ticketable"
  | "autre";

/** Libelle affichable du type classe. */
export const LIBELLE_TYPE: Record<TypeMail, string> = {
  panne_intervention: "Panne / intervention",
  sinistre_degat_eaux: "Sinistre dégât des eaux",
  demande_copro_cs: "Demande copro / CS",
  devis_validation: "Devis / validation",
  facture_contrat_fournisseur: "Facture / contrat",
  comptabilite: "Comptabilité",
  ag_cs: "AG / CS",
  vefa_reserves: "VEFA / réserves",
  non_ticketable: "Sans action",
  autre: "Autre",
};

/** Une etape du flow d'actions propose par l'assistant. */
export interface ActionFlow {
  ordre: number;
  libelle: string;
}

/** Etat de traitement d'un mail par le gestionnaire (persiste, cloisonne). */
export type StatutTraitement = "nouveau" | "repondu" | "classe";

/** Rattachement du mail a un dossier existant ou nouveau. */
export interface Rattachement {
  statut: "existant" | "nouveau";
  dossierId: string;
  dossierLabel: string;
  /** Confiance du rattachement (%) si dossier existant. */
  confiance?: number;
  /** true = dossier REEL du module Dossiers (intranet_dossiers) -> lien /dossiers/[id].
   *  false/absent = simple fil de conversation (legacy, non persiste comme dossier). */
  intranet?: boolean;
}

/** Type de dossier suggere a partir de la classification du mail (editable a la creation). */
export function typeDossierSuggere(type: TypeMail): TypeDossier {
  switch (type) {
    case "sinistre_degat_eaux":
      return "sinistre";
    case "panne_intervention":
    case "devis_validation":
    case "vefa_reserves":
      return "travaux";
    case "demande_copro_cs":
    case "ag_cs":
      return "question_diverse";
    default:
      return "autre";
  }
}

/** Piece jointe signifiante (les images de signature sont deja ecartees). */
export interface PieceJointe {
  nom: string;
}

/** Piece jointe REELLE (metadonnees Graph), chargee a la demande a l'ouverture du mail. */
export interface PieceJointeRef {
  id: string;
  nom: string;
  taille: number;
  type: string;
}

/** Un mail entrant en cours de traitement. */
export interface MailEntrant {
  id: string;
  /** Nom affiche de l'expediteur, ex "M. Bardet (copropriétaire)". */
  de: string;
  /** Adresse email de l'expediteur. */
  expediteurEmail: string;
  /** Destinataires (champ A). */
  destinataires: string[];
  /** Copie (champ Cc). */
  copie: string[];
  objet: string;
  /** Date ISO "YYYY-MM-DD" de reception (affichage). */
  date: string;
  /** Horodatage complet de reception (ISO). Sert au tri chronologique fidele a la
   *  vraie boite (ordre exact d'Outlook). Optionnel : repli sur `date` si absent. */
  recuLe?: string;
  /** Copropriete d'origine (la boite agrege plusieurs copros). */
  coproCode: string;
  coproNom: string;
  /** Lu / non lu (feeling boite mail ; passe a true a l'ouverture). */
  lu: boolean;
  /** Corps complet du mail (deja nettoye). */
  corps: string;
  attachments: PieceJointe[];
  // --- Analyse ---
  type: TypeMail;
  ticketable: boolean;
  priorite: Severite;
  badge: BadgeUrgence;
  rattachement: Rattachement;
  // --- Propositions ---
  brouillonReponse?: string;
  flow: ActionFlow[];
  // --- Etat de traitement persiste (rempli par le service, cloisonne par gestionnaire) ---
  statutTraitement?: StatutTraitement;
  etapesFaites?: number[];
  /** Dossier Outlook ou le mail a ete classe (presélection + affichage apres reload). */
  dossierClasseId?: string;
  dossierClasseNom?: string;
}

export type EvenementKind = "mail" | "action" | "pj" | "jalon";

/** Un evenement de l'historique d'un dossier (timeline). */
export interface EvenementDossier {
  /** Date ISO "YYYY-MM-DD". */
  date: string;
  acteur: string;
  resume: string;
  kind: EvenementKind;
}

/** Un dossier (affaire) suivi dans le temps, avec son historique. */
export interface Dossier {
  id: string;
  label: string;
  coproCode: string;
  coproNom: string;
  type: TypeMail;
  /** Historique du plus recent au plus ancien. */
  historique: EvenementDossier[];
}

/**
 * Contexte metier REEL d'une copropriete, source eStale (CS, AG, comptes...).
 * Enrichit le dossier d'un mail. Construit par le service depuis DonneesEstaleCopro
 * (port CondoEstaleProvider) ; `disponible=false` si la copro n'est pas sur eStale
 * ou si eStale est indisponible (degradation propre).
 */
export interface ContexteCopro {
  coproCode: string;
  disponible: boolean;
  conseilSyndical: { nomComplet: string; role: "president" | "membre" }[];
  derniereAg?: { date: string; type: "AG" | "AGE"; pvDispo?: boolean };
  budgetPrevisionnel?: number;
  depensesCourantes?: number;
  fondsTravaux?: number;
  nbProcedures?: number;
  nbDebiteurs?: number;
  contrats?: { libelle: string; categorie: string }[];
  anneeConstruction?: number;
}

export interface MesEmails {
  gestionnaire: { nomComplet: string; initiales: string };
  /** Nombre de mails du backtest passes au tri. */
  nbMailsAnalyses: number;
  /** Date du jour deja formatee, ex "12 juin 2026". */
  dateCourante: string;
  mails: MailEntrant[];
  dossiers: Dossier[];
  /** Contexte eStale par copro (rempli par le service). */
  contextes: ContexteCopro[];
  /** Copros du portefeuille du gestionnaire (rempli par le service ; rattachement manuel). */
  coprosDuGestionnaire?: { code: string; nom: string }[];
}

// Tri CHRONOLOGIQUE (plus recent d'abord), comme une vraie boite mail. On NE trie plus
// par urgence : tant que l'IA/synchro ne sont pas fiables, l'ordre doit refleter la boite
// telle quelle pour qu'on verifie d'un coup d'oeil que le cockpit = Outlook. (decision
// Sekou 2026-06-26). Cle = horodatage complet `recuLe` (repli sur `date` au jour pres).
export function trierMails(mails: MailEntrant[]): MailEntrant[] {
  return [...mails].sort((a, b) => (b.recuLe ?? b.date).localeCompare(a.recuLe ?? a.date));
}

export function trouverDossier(dossiers: Dossier[], id: string): Dossier | undefined {
  return dossiers.find((d) => d.id === id);
}

export function trouverContexte(contextes: ContexteCopro[], coproCode: string): ContexteCopro | undefined {
  return contextes.find((c) => c.coproCode === coproCode);
}
