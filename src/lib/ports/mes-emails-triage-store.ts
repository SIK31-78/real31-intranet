// Port : cache du triage "Mes emails" (sortie du pipeline d'ingestion), par
// gestionnaire. Le 'Synchroniser' ecrit (remplacer) ; le cockpit lit (lire).
// Ne depend que du domaine.

import type { Dossier, MailEntrant } from "@/lib/domain/mes-emails";

export interface TriagePersiste {
  mails: MailEntrant[];
  dossiers: Dossier[];
  nbMailsAnalyses: number;
  /** ISO de la derniere synchro ; null si jamais synchronise. */
  syncAt: string | null;
}

export interface MesEmailsTriageStore {
  lire(gestionnaireId: string): Promise<TriagePersiste>;
  /** Remplace tout le triage du gestionnaire (la synchro est une operation atomique). */
  remplacer(
    gestionnaireId: string,
    triage: { mails: MailEntrant[]; dossiers: Dossier[]; nbMailsAnalyses: number },
  ): Promise<void>;
}
