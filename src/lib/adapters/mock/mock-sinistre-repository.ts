// Adapter mock du module Sinistre : stockage memoire (Map module-level, reset au
// restart). Pour le dev hors mode supabase. Pas de cloisonnement reel (le mock n'a
// pas de vraie data) - meme posture que les autres mocks.

import type { SinistreRepository } from "@/lib/ports/sinistre-repository";
import type { DossierState } from "@/lib/domain/sinistre/types";

const STORE = new Map<string, DossierState>();
let seq = 0;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `sin_${Date.now()}_${seq}`;
}

export class MockSinistreRepository implements SinistreRepository {
  async get(id: string, _managerId: string): Promise<DossierState | null> {
    void _managerId;
    const etat = STORE.get(id);
    return etat ? { ...etat } : null;
  }

  async creer(input: {
    etat: DossierState;
    managerId: string;
  }): Promise<{ id: string; referenceInterne: string }> {
    const id = newId();
    const annee = new Date().getFullYear();
    seq += 1;
    const referenceInterne = `SIN-${annee}-${String(seq).padStart(4, "0")}`;
    STORE.set(id, { ...input.etat, id, referenceInterne });
    return { id, referenceInterne };
  }

  async patch(id: string, fields: Partial<DossierState>, _managerId: string): Promise<void> {
    void _managerId;
    const courant = STORE.get(id);
    if (!courant) return;
    // id et reference restent serveur : on ne les ecrase pas par le patch.
    const { id: _fid, referenceInterne: _fref, ...patchable } = fields;
    void _fid;
    void _fref;
    STORE.set(id, { ...courant, ...patchable });
  }
}
