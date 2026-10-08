// Rangement SIMULE du tri (ADR-046) : branche tant que MAIL_TRI_ECRITURE n'est pas a "on".
// Rien ne bouge dans la boite ; le journal note `simulation = true`. Sert a derouler tout
// le parcours (clic, journal, annulation) sans toucher un vrai mail.

import type { MailEnReception, PositionMail, RangementTriProvider } from "@/lib/ports/rangement-tri-provider";

export class SimulationRangementTri implements RangementTriProvider {
  async lireEnReception(): Promise<MailEnReception | null> {
    // En simulation, on ne relit pas la boite : champs vides, le service garde ce que la file a affiche.
    return { internetMessageId: "", expediteur: "", objet: "" };
  }

  async assurerDossier(_boite: string, p: { folderIdConnu: string | null; nom: string }): Promise<{ folderId: string }> {
    return { folderId: p.folderIdConnu ?? `simulation:${p.nom}` };
  }

  async deplacer(_boite: string, messageId: string): Promise<{ messageId: string }> {
    return { messageId };
  }

  async etiqueter(): Promise<void> {}

  /** En simulation, rien n'a bouge : il n'y a rien a verifier. */
  async localiser(): Promise<PositionMail | null> {
    return null;
  }

  async remettreEnReception(_boite: string, messageId: string): Promise<{ messageId: string }> {
    return { messageId };
  }
}
