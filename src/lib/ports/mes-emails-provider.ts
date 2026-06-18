// Port (contrat) de l'ecran "Mes emails" : boite mail triee du gestionnaire.
// Cote reel, l'implementation lira le resultat du tri de l'assistant-ia (export
// d'archive backteste). Ne depend que du domaine.

import type { MesEmails } from "@/lib/domain/mes-emails";

export interface MesEmailsProvider {
  getMesEmails(gestionnaireId: string): Promise<MesEmails>;
}
