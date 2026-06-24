// Service : cree un brouillon de reponse dans la boite Outlook du gestionnaire
// courant (rattache au mail d'origine). Passe par le routeur (ADR-001).

import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { getMailOutboundProvider } from "@/lib/adapters/router";

export async function creerBrouillonOutlook(
  g: Gestionnaire,
  internetMessageId: string,
  corps: string,
): Promise<void> {
  if (!g.email) throw new Error("Pas d'email pour ce gestionnaire : impossible de cibler la boite.");
  await getMailOutboundProvider().creerBrouillon({
    boite: g.email,
    internetMessageId,
    corps,
  });
}
