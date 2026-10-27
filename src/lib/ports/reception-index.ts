// Port de l'index local de la boite de reception d'une boite triee (ADR-046, revision V2 du
// 27/10/2026, REA-419). La file a trier et le rangement automatique lisent cet index au lieu
// de relire les 100 mails les plus recents dans Graph a chaque affichage et toutes les 5 min :
// il est tenu a jour par la lecture incrementale de Graph (port ReceptionDeltaProvider), et
// l'app y marque tout de suite ce qu'elle range (sans attendre le delta suivant).
// Une ligne par mail ; un mail sorti de la reception garde sa ligne 30 jours (`sorti_le`).
// Ne depend que du domaine.

import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";

/**
 * L'index n'existe pas encore (supabase/sql/intranet_mail_reception.sql pas passe) : les
 * appelants retombent sur l'ancienne lecture directe de la boite (lireRecents).
 */
export class IndexReceptionAbsent extends Error {
  constructor() {
    super("Index de la réception absent : passer supabase/sql/intranet_mail_reception.sql.");
    this.name = "IndexReceptionAbsent";
  }
}

/** Ou en est la lecture incrementale d'une boite. */
export interface EtatDelta {
  /**
   * Lien de reprise Graph : le `@odata.deltaLink` du dernier passage complet, ou le
   * `@odata.nextLink` d'un passage interrompu par son budget de temps. null = tout relire.
   */
  jeton: string | null;
  /** Dernier passage (reussi ou non), ISO. */
  majLe: string;
  /** Message du dernier passage en echec, null s'il a reussi. */
  erreur: string | null;
  /**
   * Debut d'une relecture complete en cours (premier passage, ou jeton expire), ISO. A la fin
   * de cette relecture, les mails de l'index qu'elle n'a pas revus ont quitte la reception.
   */
  resynchroLe: string | null;
}

export interface ReceptionIndex {
  /**
   * Applique un delta : `ajoutes` = mails presents dans la reception (nouveaux, revenus ou
   * modifies : remis « en reception ») ; `retires` = ids GRAPH des mails sortis de la
   * reception (entrees `@removed` du delta : elles n'ont que l'id). Rend les internetMessageId
   * marques sortis.
   */
  appliquer(boite: string, delta: { ajoutes: RawMail[]; retires: string[] }): Promise<{ sortis: string[] }>;
  /** Les mails en reception (non sortis), du plus ancien au plus recent, recus depuis `depuis` si donne. */
  enReception(boite: string, opts?: { depuis?: string }): Promise<RawMail[]>;
  /** Le nombre de mails en reception, recus depuis `depuis` si donne. */
  compter(boite: string, opts?: { depuis?: string }): Promise<number>;
  /** Ou en est la lecture incrementale, null si elle n'a jamais tourne. */
  jetonDelta(boite: string): Promise<EtatDelta | null>;
  enregistrerJetonDelta(boite: string, etat: { jeton: string | null; erreur?: string | null; resynchroLe?: string | null }): Promise<void>;
  /** L'app vient de ranger ou de supprimer ces mails (internetMessageId) : sortis tout de suite. */
  sortir(boite: string, internetMessageIds: string[]): Promise<void>;
  /** Une annulation a remis ce mail dans la reception, avec son nouvel id Graph s'il est connu. */
  remettre(boite: string, internetMessageId: string, messageId?: string): Promise<void>;
  /** Fin d'une relecture complete : les mails en reception pas revus depuis `avantISO` sont sortis. Rend leur nombre. */
  sortirNonRevus(boite: string, avantISO: string): Promise<number>;
  /** Oublie les mails sortis avant cette date. Rend le nombre de lignes effacees. */
  purger(boite: string, sortisAvantISO: string): Promise<number>;
}
