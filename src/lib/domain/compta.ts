// Domaine du "pole compta" : l'aller-retour gestionnaire <-> comptable autour de la
// preparation des comptes d'une AG. But : que les notes de la comptable et les reponses
// du gestionnaire vivent dans l'intranet (et ne se perdent plus apres le CS). Types purs.

/** Qui a ecrit la note. (Sans vraie auth : determine par le contexte - vue compta vs fiche.) */
export type AuteurNote = "comptable" | "gestionnaire";

/** Une note dans le fil comptes (question de la comptable, ou reponse du gestionnaire). */
export interface NoteCompta {
  id: string;
  auteur: AuteurNote;
  texte: string;
  /** Traitee (point regle) : ne reste plus "a faire". */
  resolu: boolean;
  /** ISO "YYYY-MM-DDTHH:mm:ssZ". */
  createdAt: string;
  /** Initiales / nom de qui a ecrit ou marque. */
  marquePar?: string;
}

/** Etat compta d'une AG : les 2 flags + le fil de notes. */
export interface EtatCompta {
  /** La comptable a fini de verifier les comptes (visible au gestionnaire). */
  comptesVerifies: boolean;
  /** Le CS demande les comptes AVANT la reunion (gestionnaire -> comptable). */
  envoyerAvant: boolean;
  /** Fil de notes, du plus ancien au plus recent. */
  notes: NoteCompta[];
}

/** Une AG a preparer, vue cote comptable (file de travail). */
export interface AgAPreparer {
  coproCode: string;
  coproNom: string;
  /** Date d'AG (ISO "YYYY-MM-DD"). */
  agDate: string;
  comptesVerifies: boolean;
  envoyerAvant: boolean;
  /** Nb de notes non resolues (en attente de traitement). */
  notesOuvertes: number;
}

/** Les 2 flags compta, identifiants stables (stockes dans intranet_odj_champs). */
export const FLAG_COMPTES_VERIFIES = "compta.comptes_verifies";
export const FLAG_ENVOYER_AVANT = "compta.envoyer_avant";
