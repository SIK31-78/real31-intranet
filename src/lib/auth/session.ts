// Session "gestionnaire courant" (cloisonnement). Mecanisme dev par cookie, en
// attendant l'auth Entra ID qui remplacera juste la selection. Le cloisonnement
// (filtrage par managerId) est applique cote service/adapter, pas en RLS.

import { cookies } from "next/headers";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { getGestionnaireRepository } from "@/lib/adapters/router";

export const COOKIE_GESTIONNAIRE = "gid";

/** Gestionnaire courant : cookie si present et valide, sinon le premier (defaut dev). */
export async function getGestionnaireCourant(): Promise<Gestionnaire | null> {
  const repo = getGestionnaireRepository();
  const id = (await cookies()).get(COOKIE_GESTIONNAIRE)?.value;
  if (id) {
    const g = await repo.findById(id);
    if (g) return g;
  }
  const tous = await repo.list();
  return tous[0] ?? null;
}
