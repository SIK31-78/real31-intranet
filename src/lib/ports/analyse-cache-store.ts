// Port : cache d'analyse par mail (memoisation). On ne renvoie JAMAIS au LLM un
// mail deja analyse. Cle = internetMessageId (immuable). Distinct de l'etat
// (ce que le gestionnaire a fait) et du triage (la vue assemblee). Ne depend que
// du domaine.

import type { TypeMail } from "@/lib/domain/mes-emails";

/** Resultat d'analyse memoise pour un mail. */
export interface AnalyseCachee {
  internetMessageId: string;
  type: TypeMail;
  ticketable: boolean;
  estNouveauTicket: boolean;
  confidence: number;
  rationale: string;
  /** Brouillon de reponse genere ("" si non ticketable / non genere). */
  brouillon: string;
  /** Etapes du plan d'action. */
  etapes: string[];
  /** Version des prompts utilisee -> invalide le cache si les prompts changent. */
  promptVersion: string;
}

export interface AnalyseCacheStore {
  /** Analyses deja calculees pour ces mails (cle = internetMessageId). */
  lirePar(gestionnaireId: string, internetMessageIds: string[]): Promise<Map<string, AnalyseCachee>>;
  ecrire(gestionnaireId: string, analyse: AnalyseCachee): Promise<void>;
}
