// Port de la recopie d'un mail d'une boîte partagée à une autre (ADR-050, 28/10/2026).
// Microsoft Graph ne déplace pas un message entre deux boîtes : on le recrée à l'identique
// dans la réception de la cible (expéditeur, destinataires, objet, dates, corps, pièces
// jointes, identifiant Internet, fil), NON brouillon et non lu. Ne dépend que du domaine.

import type { PieceComparee } from "@/lib/domain/bascule-boites";

/** Où se trouve un mail dans une boîte, retrouvé par son internetMessageId. */
export interface SituationMail {
  /** Id Graph (immuable). */
  messageId: string;
  /** Boîte de réception, Éléments supprimés, ou ailleurs (dossier de binôme, Comptabilité...). */
  lieu: "reception" | "corbeille" | "autre";
  /** La boîte d'où vient la copie, si c'est une copie faite par l'intranet ; null pour un mail reçu. */
  recopieDe: string | null;
  expediteur: string;
  objet: string;
  conversationId?: string;
}

export interface RecopieInterBoitesProvider {
  /**
   * Le mail dans cette boîte : hors Éléments supprimés d'abord ; s'il n'est QUE là, sa place
   * dans la corbeille ; null s'il n'y est pas du tout.
   */
  situer(boite: string, internetMessageId: string): Promise<SituationMail | null>;
  /**
   * Recrée le mail dans la Boîte de réception de la cible, à l'identique, non brouillon et non
   * lu ; rend l'id de la copie. En cas d'échec en route (pièce refusée), la copie partielle est
   * effacée avant de lever l'erreur : rien de bancal ne reste dans la cible.
   */
  recopier(source: string, messageId: string, cible: string): Promise<{ messageId: string }>;
  /** Les pièces jointes du mail (nom, en ligne ou non) : pour juger qu'une copie est complète. */
  pieces(boite: string, messageId: string): Promise<PieceComparee[]>;
  /** Efface une copie incomplète faite par l'intranet (jamais un mail reçu). */
  effacerCopie(boite: string, messageId: string): Promise<void>;
}
