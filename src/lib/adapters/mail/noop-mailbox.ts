// Adapter "boite aux lettres" no-op : ne deplace rien (pas de Graph). Pour
// MAIL_SOURCE != graph (dev/demo) -> le classement reste cote intranet seulement.

import type { DossierBoite, MailboxProvider, PieceJointeRef, ResultatCorbeille } from "@/lib/ports/mailbox-provider";

export class NoopMailboxProvider implements MailboxProvider {
  async listerImagesInline(): Promise<PieceJointeRef[]> {
    return [];
  }

  async listerDossiers(): Promise<DossierBoite[]> {
    return [];
  }

  async creerDossier(_boite: string, nom: string): Promise<DossierBoite> {
    console.log("[mailbox:noop] creation de dossier simulee");
    return { id: `noop-${nom}`, nom, niveau: 1 };
  }

  async classerDansDossier(p: {
    boite: string;
    internetMessageId: string;
    folderId: string;
  }): Promise<{ deplace: boolean }> {
    console.log(`[mailbox:noop] classement simule de ${p.internetMessageId} -> dossier ${p.folderId}`);
    return { deplace: false };
  }

  async mettreALaCorbeille(p: { boite: string; internetMessageIds: string[] }): Promise<ResultatCorbeille> {
    // Rien ne bouge sans Graph : tout est rendu en echec, l'ecran le dit au lieu de faire semblant.
    console.log(`[mailbox:noop] corbeille simulee (${p.internetMessageIds.length} mails)`);
    return { deplaces: [], echecs: [...p.internetMessageIds] };
  }

  async listerPiecesJointes(): Promise<PieceJointeRef[]> {
    return [];
  }

  async lirePieceJointe(): Promise<{ nom: string; type: string; base64: string }> {
    throw new Error("Pieces jointes indisponibles (boite non branchee).");
  }

  async marquerLu(): Promise<void> {
    // Pas d'Outlook : seul l'etat intranet compte.
  }

  async lireEtatsLu(): Promise<Map<string, boolean>> {
    return new Map();
  }
}
