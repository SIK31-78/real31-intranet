// Service : pieces jointes du mail, chargees A LA DEMANDE (l'ingestion ne les fetch
// pas au sync, trop couteux). Liste les metadonnees ; le contenu passe en flux par la
// route /mes-emails/pj. Passe par le routeur (ADR-001).

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

/** La pièce en flux, pour la route d'aperçu et de téléchargement (REA-421, 27/10/2026). */
export async function fluxPieceJointeMail(boite: string, internetMessageId: string, attachmentId: string) {
  return getMailboxProvider().fluxPieceJointe({ boite, internetMessageId, attachmentId });
}
