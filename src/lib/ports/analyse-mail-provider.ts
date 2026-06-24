// Port d'analyse d'un mail (anticipe dans le domaine mes-emails) : classification
// + proposition de reponse/plan. Mock aujourd'hui, Mistral en reel, modele local
// demain = swap d'adapter. Ne depend que du domaine.

import type { Classification, PlanPropose } from "@/lib/domain/tri-mail/raw-mail";

/** Mail deja nettoye, pret a analyser. */
export interface MailAClasser {
  de: string;
  objet: string;
  corps: string;
}

export interface AnalyseMailProvider {
  classifier(mail: MailAClasser): Promise<Classification>;
  genererReponseEtPlan(mail: MailAClasser, affaire: string): Promise<PlanPropose>;
}
