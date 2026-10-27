// Service : classe un mail dans un dossier Outlook choisi. Passe par le routeur (ADR-001).
// (Le classement « par copro » du port n'a plus d'appelant depuis le 27/10/2026 : le dossier
// se choisit toujours dans la liste.)

import { getMailboxProvider } from "@/lib/adapters/router";
import type { DossierBoite } from "@/lib/ports/mailbox-provider";

/** Liste les vrais dossiers de la boite (pour le selecteur de classement). */
export async function listerDossiersBoite(boite: string): Promise<DossierBoite[]> {
  return getMailboxProvider().listerDossiers(boite);
}

/** Cree le sous-dossier d'une copro sous la boite de reception (ou reprend l'existant). */
export async function creerDossierBoite(boite: string, nom: string): Promise<DossierBoite> {
  return getMailboxProvider().creerDossier(boite, nom);
}

/** Deplace un mail dans un dossier CHOISI (par son id). */
export async function classerDansDossier(
  boite: string,
  internetMessageId: string,
  folderId: string,
): Promise<{ deplace: boolean }> {
  return getMailboxProvider().classerDansDossier({ boite, internetMessageId, folderId });
}
