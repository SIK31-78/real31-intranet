// Service : signature HTML du gestionnaire courant (Signitic), pour l'afficher
// sous la reponse ("ajoutee a l'envoi"). Degrade en null si pas d'email / source.

import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { getSignatureProvider } from "@/lib/adapters/router";

export async function getSignatureGestionnaire(g: Gestionnaire): Promise<string | null> {
  if (!g.email) return null;
  try {
    return await getSignatureProvider().getSignatureHtml(g.email);
  } catch {
    return null;
  }
}
