// Adapter mock du module Dossiers : stockage memoire (reset au restart). Pour le dev
// hors mode supabase.

import type { CreationDossier, DossierRepository, PatchDossier } from "@/lib/ports/dossier-repository";
import type { Dossier } from "@/lib/domain/dossier";

const STORE = new Map<string, Dossier>();
let seq = 1;

export class MockDossierRepository implements DossierRepository {
  async listPourCopros(coproCodes: string[]): Promise<Dossier[]> {
    return [...STORE.values()].filter((d) => coproCodes.includes(d.coproCode));
  }
  async get(id: string): Promise<Dossier | null> {
    return STORE.get(id) ?? null;
  }
  async creer(input: CreationDossier): Promise<string> {
    const id = `d${seq++}`;
    STORE.set(id, {
      id,
      coproCode: input.coproCode,
      type: input.type,
      portee: input.portee,
      titre: input.titre,
      statut: "ouvert",
      ouvertLe: new Date().toISOString(),
      etapes: input.etapes,
      journal: input.journal,
      ...(input.cible ? { cible: input.cible } : {}),
      ...(input.origine ? { origine: input.origine } : {}),
      ...(input.ouvertPar ? { ouvertPar: input.ouvertPar } : {}),
    });
    return id;
  }
  async patch(id: string, fields: PatchDossier): Promise<void> {
    const d = STORE.get(id);
    if (!d) return;
    // agDate/numeroResolution acceptent null (= effacer) -> on normalise en undefined.
    const { agDate, numeroResolution, ...rest } = fields;
    const next: Dossier = { ...d, ...rest };
    if (agDate !== undefined) next.agDate = agDate ?? undefined;
    if (numeroResolution !== undefined) next.numeroResolution = numeroResolution ?? undefined;
    STORE.set(id, next);
  }
  async supprimer(id: string): Promise<void> {
    STORE.delete(id);
  }
}
