// Adapter mock du cache de triage : STORE module-level (le temps du dev server).

import type { Dossier, MailEntrant } from "@/lib/domain/mes-emails";
import type { MesEmailsTriageStore, TriagePersiste } from "@/lib/ports/mes-emails-triage-store";

const STORE = new Map<string, TriagePersiste>();

export class MockMesEmailsTriageStore implements MesEmailsTriageStore {
  async lire(gestionnaireId: string): Promise<TriagePersiste> {
    return STORE.get(gestionnaireId) ?? { mails: [], dossiers: [], nbMailsAnalyses: 0, syncAt: null };
  }
  async remplacer(
    gestionnaireId: string,
    triage: { mails: MailEntrant[]; dossiers: Dossier[]; nbMailsAnalyses: number },
  ): Promise<void> {
    // Pas de Date.now ici n'est pas un souci (runtime Node) ; on marque la synchro.
    STORE.set(gestionnaireId, { ...triage, syncAt: new Date().toISOString() });
  }
}
