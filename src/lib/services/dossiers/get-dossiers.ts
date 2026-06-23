// Service du module Dossiers. Cloisonne : un gestionnaire ne voit que les dossiers de
// ses copros. Passe par le routeur (ADR-001).

import { getCoproRepository, getDossierRepository } from "@/lib/adapters/router";
import type { Dossier } from "@/lib/domain/dossier";

/** Membre assignable (gestionnaire / assistant) pour l'assignation des taches. */
export interface MembreAssignable {
  nom: string;
  initiales: string;
}
export interface DossierVue {
  dossier: Dossier;
  gestionnaire?: MembreAssignable;
  assistant?: MembreAssignable;
}

/** Tous les dossiers du gestionnaire (de ses copros), enrichis du nom de copro. */
export async function getDossiers(managerId: string): Promise<Dossier[]> {
  const copros = await getCoproRepository().list(managerId);
  const noms = new Map(copros.map((c) => [c.code, c.nom]));
  const dossiers = await getDossierRepository().listPourCopros([...noms.keys()]);
  return dossiers.map((d) => ({ ...d, coproNom: noms.get(d.coproCode) }));
}

/** Un dossier + l'equipe assignable (gestionnaire/assistant) de sa copro. null si hors
 *  perimetre du gestionnaire. */
export async function getDossier(id: string, managerId: string): Promise<DossierVue | null> {
  const d = await getDossierRepository().get(id);
  if (!d) return null;
  const copro = await getCoproRepository().findByCode(d.coproCode, managerId);
  if (!copro) return null; // hors scope
  const membre = (role: "gestionnaire" | "assistant"): MembreAssignable | undefined => {
    const m = copro.equipe.find((x) => x.role === role);
    return m ? { nom: m.nomComplet, initiales: m.initiales } : undefined;
  };
  return {
    dossier: { ...d, coproNom: copro.nom },
    ...(membre("gestionnaire") ? { gestionnaire: membre("gestionnaire") } : {}),
    ...(membre("assistant") ? { assistant: membre("assistant") } : {}),
  };
}

/** Dossiers rattaches a une copro precise (pour l'onglet Dossiers de la fiche copro). */
export async function getDossiersCopro(coproCode: string, managerId: string): Promise<Dossier[]> {
  const copro = await getCoproRepository().findByCode(coproCode, managerId);
  if (!copro) return [];
  const dossiers = await getDossierRepository().listPourCopros([coproCode]);
  return dossiers.map((d) => ({ ...d, coproNom: copro.nom }));
}
