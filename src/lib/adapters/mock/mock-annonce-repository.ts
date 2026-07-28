// Adapter mock des annonces (STORE module-level, comme les autres mocks). Dev local
// + tests offline.

import type { Annonce } from "@/lib/domain/annonce";
import type { AnnonceRepository, PatchAnnonce, SaisieAnnonce } from "@/lib/ports/annonce-repository";

const STORE = new Map<string, Annonce>();
let seq = 0;

function parDateDesc(a: Annonce, b: Annonce): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

export class MockAnnonceRepository implements AnnonceRepository {
  async listerActives(): Promise<Annonce[]> {
    return [...STORE.values()].filter((a) => a.actif).sort(parDateDesc).map((a) => ({ ...a }));
  }

  async listerToutes(): Promise<Annonce[]> {
    return [...STORE.values()].sort(parDateDesc).map((a) => ({ ...a }));
  }

  async creer(saisie: SaisieAnnonce): Promise<Annonce> {
    seq += 1;
    const a: Annonce = {
      id: `an-${seq}`,
      titre: saisie.titre,
      niveau: saisie.niveau,
      actif: saisie.actif,
      createdAt: new Date().toISOString(),
      ...(saisie.corps ? { corps: saisie.corps } : {}),
      ...(saisie.agences && saisie.agences.length > 0 ? { agences: [...saisie.agences] } : {}),
      ...(saisie.emails && saisie.emails.length > 0 ? { emails: [...saisie.emails] } : {}),
      ...(saisie.auteurEmail ? { auteurEmail: saisie.auteurEmail } : {}),
      ...(saisie.auteurInitiales ? { auteurInitiales: saisie.auteurInitiales } : {}),
    };
    STORE.set(a.id, a);
    return { ...a };
  }

  async patch(id: string, patch: PatchAnnonce): Promise<Annonce | null> {
    const a = STORE.get(id);
    if (!a) return null;
    const maj: Annonce = { ...a, updatedAt: new Date().toISOString() };
    if (patch.titre !== undefined) maj.titre = patch.titre;
    if (patch.niveau !== undefined) maj.niveau = patch.niveau;
    if (patch.actif !== undefined) maj.actif = patch.actif;
    if (patch.corps !== undefined) {
      if (patch.corps === null || patch.corps === "") delete maj.corps;
      else maj.corps = patch.corps;
    }
    STORE.set(id, maj);
    return { ...maj };
  }

  async supprimer(id: string): Promise<boolean> {
    return STORE.delete(id);
  }
}
