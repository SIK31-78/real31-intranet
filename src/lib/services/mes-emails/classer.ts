// Service : classe un mail dans un dossier Outlook (par copro ou par dossier choisi).
// Passe par le routeur (ADR-001).

import { getMailboxProvider } from "@/lib/adapters/router";
import type { DossierBoite } from "@/lib/ports/mailbox-provider";

export async function classerDansCopro(
  boite: string,
  internetMessageId: string,
  coproCode: string,
  coproNom: string,
): Promise<{ deplace: boolean; dossier?: string }> {
  return getMailboxProvider().classerDansCopro({ boite, internetMessageId, coproCode, coproNom });
}

/** Liste les vrais dossiers de la boite (pour le selecteur de classement). */
export async function listerDossiersBoite(boite: string): Promise<DossierBoite[]> {
  return getMailboxProvider().listerDossiers(boite);
}

/** Deplace un mail dans un dossier CHOISI (par son id). */
export async function classerDansDossier(
  boite: string,
  internetMessageId: string,
  folderId: string,
): Promise<{ deplace: boolean }> {
  return getMailboxProvider().classerDansDossier({ boite, internetMessageId, folderId });
}
