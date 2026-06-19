"use server";

// Donnees de la palette de recherche (Cmd+K). Chargees a l'ouverture (lazy),
// scopees au gestionnaire courant (cloisonnement). Pas de cout par page.

import { getGestionnaireCourant } from "@/lib/auth/session";
import { getCoproprietes } from "@/lib/services/coproprietes/get-coproprietes";

export interface CoproRecherche {
  code: string;
  nom: string;
  ville: string;
}

export async function chargerCoprosRecherche(): Promise<CoproRecherche[]> {
  const g = await getGestionnaireCourant();
  if (!g) return [];
  const copros = await getCoproprietes(g.id);
  return copros.map((c) => ({ code: c.code, nom: c.nom, ville: c.adresse?.ville ?? "" }));
}
