// Service du module Dossiers. Cloisonne : un gestionnaire ne voit que les dossiers de
// ses copros. Passe par le routeur (ADR-001).

import { getCoproRepository, getDossierRepository } from "@/lib/adapters/router";
import type { Dossier } from "@/lib/domain/dossier";

/** Tous les dossiers du gestionnaire (de ses copros), enrichis du nom de copro. */
export async function getDossiers(managerId: string): Promise<Dossier[]> {
  const copros = await getCoproRepository().list(managerId);
  const noms = new Map(copros.map((c) => [c.code, c.nom]));
  const dossiers = await getDossierRepository().listPourCopros([...noms.keys()]);
  return dossiers.map((d) => ({ ...d, coproNom: noms.get(d.coproCode) }));
}

/** Un dossier, si la copro est dans le perimetre du gestionnaire (sinon null). */
export async function getDossier(id: string, managerId: string): Promise<Dossier | null> {
  const d = await getDossierRepository().get(id);
  if (!d) return null;
  const copro = await getCoproRepository().findByCode(d.coproCode, managerId);
  if (!copro) return null; // hors scope
  return { ...d, coproNom: copro.nom };
}
