// Port de la lecture INCREMENTALE de la boite de reception d'une boite triee (ADR-046,
// revision V2 du 27/10/2026, REA-419) : ce qui y est entre et ce qui en est sorti depuis le
// dernier passage, au lieu de relire les 100 mails les plus recents. En reel, la requete
// delta de Graph (graph-reception-delta.ts) ; l'echantillon rend ses mails fictifs une fois.
// Ne depend que du domaine.

import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";

export interface OptionsDelta {
  /** Lien de reprise du passage precedent (deltaLink ou nextLink), null = tout relire depuis `depuis`. */
  jeton: string | null;
  /** Relecture complete : seulement les mails recus depuis cette date (ISO), la mise en service du tri. */
  depuis?: string;
  /**
   * Temps de lecture au-dela duquel on s'arrete apres la page en cours : le lien de la page
   * suivante devient le jeton, la lecture reprend au passage suivant.
   */
  budgetMs: number;
  maintenant?: () => number;
}

export interface ResultatDelta {
  /** Mails presents dans la reception : nouveaux, revenus, ou modifies. */
  ajoutes: RawMail[];
  /** Ids Graph des mails sortis de la reception (ranges, supprimes, glisses ailleurs). */
  retires: string[];
  /** Pages lues. */
  pages: number;
  /** Lien de reprise a garder pour le passage suivant. */
  jeton: string;
  /** true = la lecture est allee jusqu'au bout (deltaLink) ; false = budget atteint, a reprendre. */
  complet: boolean;
  /** true = le jeton donne avait expire : la lecture est repartie de zero depuis `depuis`. */
  reinitialise: boolean;
}

export interface ReceptionDeltaProvider {
  lireDelta(boite: string, opts: OptionsDelta): Promise<ResultatDelta>;
}
