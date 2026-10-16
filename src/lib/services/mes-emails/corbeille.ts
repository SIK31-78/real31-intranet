// Service : met des mails de la boîte PERSONNELLE à la corbeille (REA-340, 16/10/2026).
// Déplacement vers « Éléments supprimés », réversible depuis Outlook. Passe par le
// routeur (ADR-001). Le contrôle « boîte perso + pilote » est fait dans l'action.

import { getMailboxProvider } from "@/lib/adapters/router";
import type { ResultatCorbeille } from "@/lib/ports/mailbox-provider";

export type { ResultatCorbeille };

export async function mettreALaCorbeille(boite: string, internetMessageIds: string[]): Promise<ResultatCorbeille> {
  const ids = [...new Set(internetMessageIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return { deplaces: [], echecs: [] };
  return getMailboxProvider().mettreALaCorbeille({ boite, internetMessageIds: ids });
}
