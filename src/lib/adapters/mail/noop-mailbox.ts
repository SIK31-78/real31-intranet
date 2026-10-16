// Adapter "boite aux lettres" no-op : ne deplace rien (pas de Graph). Pour
// MAIL_SOURCE != graph (dev/demo) -> le classement reste cote intranet seulement.

import type { DossierBoite, MailboxProvider, PieceJointeRef } from "@/lib/ports/mailbox-provider";

export class NoopMailboxProvider implements MailboxProvider {
  async listerImagesInline(): Promise<PieceJointeRef[]> {
    return [];
  }

  async classerDansCopro(p: {
    boite: string;
    internetMessageId: string;
    coproCode: string;
    coproNom: string;
  }): Promise<{ deplace: boolean; dossier?: string }> {
    console.log(`[mailbox:noop] classement simule de ${p.internetMessageId} (copro ${p.coproCode})`);
    return { deplace: false };
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

  async listerPiecesJointes(): Promise<PieceJointeRef[]> {
    return [];
  }

  async lirePieceJointe(): Promise<{ nom: string; type: string; base64: string }> {
    throw new Error("Pieces jointes indisponibles (boite non branchee).");
  }
}
