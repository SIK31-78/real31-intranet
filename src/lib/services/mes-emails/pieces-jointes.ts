// Service : pieces jointes du mail, chargees A LA DEMANDE (l'ingestion ne les fetch
// pas au sync, trop couteux). Liste les metadonnees + recupere le contenu pour le
// telechargement cote client. Passe par le routeur (ADR-001).

import type { PieceJointeRef } from "@/lib/domain/mes-emails";
import { imagesDuCorps } from "@/lib/domain/images-mail";
import { getMailboxProvider } from "@/lib/adapters/router";

export async function listerPiecesJointesMail(
  boite: string,
  internetMessageId: string,
): Promise<PieceJointeRef[]> {
  return getMailboxProvider().listerPiecesJointes({ boite, internetMessageId });
}

/** Les photos collées dans le corps (logos de signature écartés), REA-328. */
export async function listerImagesMail(boite: string, internetMessageId: string): Promise<PieceJointeRef[]> {
  return imagesDuCorps(await getMailboxProvider().listerImagesInline({ boite, internetMessageId }));
}

export async function lirePieceJointeMail(
  boite: string,
  internetMessageId: string,
  attachmentId: string,
): Promise<{ nom: string; type: string; base64: string }> {
  return getMailboxProvider().lirePieceJointe({ boite, internetMessageId, attachmentId });
}
