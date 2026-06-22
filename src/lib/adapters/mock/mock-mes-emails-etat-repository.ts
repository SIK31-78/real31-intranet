// Adapter mock de l'etat "Mes emails" : STORE module-level (persiste le temps du
// dev server, repart a zero au redemarrage). Pas de cloisonnement en mock.

import type {
  CleEtat,
  EtatMail,
  MajBrouillon,
  MajEtapes,
  MajRattachement,
  MajStatut,
  MesEmailsEtatRepository,
} from "@/lib/ports/mes-emails-etat-provider";

const STORE = new Map<string, { gid: string; etat: EtatMail }>();
const cle = (gid: string, emailId: string) => `${gid}::${emailId}`;

function maj(gid: string, emailId: string, patch: Partial<EtatMail>): void {
  const k = cle(gid, emailId);
  const courant: EtatMail = STORE.get(k)?.etat ?? { emailId, statut: "nouveau", etapesFaites: [], lu: false };
  STORE.set(k, { gid, etat: { ...courant, ...patch } });
}

export class MockMesEmailsEtatRepository implements MesEmailsEtatRepository {
  async getEtats(gestionnaireId: string): Promise<EtatMail[]> {
    return [...STORE.values()].filter((e) => e.gid === gestionnaireId).map((e) => e.etat);
  }
  async setStatut(p: MajStatut): Promise<void> {
    maj(p.gestionnaireId, p.emailId, {
      statut: p.statut,
      etapesFaites: p.etapesFaites,
      ...(p.brouillon !== undefined ? { brouillon: p.brouillon } : {}),
    });
  }
  async setEtapes(p: MajEtapes): Promise<void> {
    maj(p.gestionnaireId, p.emailId, { etapesFaites: p.etapesFaites });
  }
  async setLu(p: CleEtat): Promise<void> {
    maj(p.gestionnaireId, p.emailId, { lu: true });
  }
  async setBrouillon(p: MajBrouillon): Promise<void> {
    maj(p.gestionnaireId, p.emailId, { brouillon: p.brouillon });
  }
  async setRattachement(p: MajRattachement): Promise<void> {
    maj(p.gestionnaireId, p.emailId, { rattachement: p.rattachement });
  }
}
