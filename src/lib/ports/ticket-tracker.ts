// Port (contrat) du SUIVI DE TICKETS externe : creer un ticket depuis une remontee
// collaborateur, et relire l'etat des tickets connus. Une seule implementation reelle
// aujourd'hui (Linear), plus un no-op quand aucune cle n'est configuree.
//
// Ne depend que du domaine. Le port est volontairement maigre : le cron a besoin de
// deux gestes (creer, relire un lot), rien de plus. Pas de `commenter`, pas de
// `fermer` - tant que personne n'en a besoin, ils n'existent pas.

import type { Feedback } from "@/lib/domain/feedback";

/** Ce que l'adapter rend apres creation : de quoi rapprocher la ligne en base. */
export interface TicketCree {
  /** uuid de l'issue : LA cle de rapprochement (stable, jamais reutilisee). */
  issueId: string;
  /** 'REA-87' : lisible, sert a l'affichage et aux liens. */
  identifiant: string;
  url: string;
}

/** Etat courant d'un ticket, tel que le retour du cron le consomme. */
export interface EtatTicket {
  issueId: string;
  identifiant: string;
  /** Titre COURANT du ticket : compare au titre de la remontee pour detecter la
   *  derive apres reformulation par l'agent de triage (cf. renommerTicket). */
  titre: string;
  /** Nom affiche de l'etat ('Done', 'Canceled'...) : sert a tracer la raison d'ecart. */
  nomEtat: string;
  /** `type` de l'etat Linear ('completed', 'canceled'...) : c'est LUI qu'on mappe. */
  typeEtat: string;
  /** ISO ; present quand le ticket est passe en etat termine (date du changelog). */
  termineAt?: string;
}

export interface TicketTracker {
  /** Le suivi est-il reellement branche ? false = adapter no-op (pas de cle). */
  estActif(): boolean;
  /** Cree le ticket correspondant a la remontee. Leve si l'appel echoue. */
  creerTicket(remontee: Feedback): Promise<TicketCree>;
  /**
   * Renomme le ticket. Le TITRE est porte par la base (c'est lui qui s'affiche sur
   * /nouveautes, reformule au triage en langage non technique) : le cron le pousse
   * pour que Linear montre la meme phrase claire, plutot que le titre brut derive
   * de la description a la creation (arbitrage Sekou du 2026-10-06).
   *
   * La PRIORITE, elle, n'est posee qu'a la naissance et jamais reecrite : c'est
   * Linear qui la porte ensuite (Sekou la change a la main en triant).
   */
  renommerTicket(issueId: string, titre: string): Promise<void>;
  /**
   * Etat courant des tickets demandes, par uuid. Les ids inconnus (ticket supprime
   * dans Linear) sont simplement ABSENTS du resultat - jamais une erreur : un ticket
   * efface a la main ne doit pas faire echouer tout le cron.
   */
  lireEtats(issueIds: readonly string[]): Promise<EtatTicket[]>;
}
