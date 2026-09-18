// L'acteur du module cles, resolu depuis la session : agence (Gestionnaire.agencyId -> code
// via public."Agency"), direction (table, env, super-admin) ou referent syndic par agence.

import { getAgenceRepository } from "@/lib/adapters/router";
import type { Acteur } from "@/lib/domain/cles/acteur";
import { AGENCES_CLES } from "@/lib/domain/cles/types";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { estDirection, estReferentSyndic, profilDe } from "./roles";

export async function acteurCles(g: Gestionnaire): Promise<Acteur> {
  const profil = profilDe(g);
  let agence: string | undefined;
  if (g.agencyId) {
    const agences = await getAgenceRepository().listerAgences().catch(() => []);
    agence = agences.find((a) => a.id === g.agencyId)?.code;
  }
  const direction: Acteur["direction"] = estDirection(profil) ? "toutes" : AGENCES_CLES.filter((a) => estReferentSyndic(profil, a));
  return { id: g.id, nom: g.nomComplet, ...(agence ? { agence } : {}), direction };
}
