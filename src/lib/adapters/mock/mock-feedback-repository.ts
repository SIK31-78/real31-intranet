// Adapter mock des remontees (STORE module-level, comme les autres mocks : les remontees
// persistent entre les requetes tant que le process tourne). Sert au dev local ET aux
// tests offline (les services testes passent par le routeur -> ce mock).

import type { Feedback, StatutFeedback } from "@/lib/domain/feedback";
import { estStatutPublic } from "@/lib/domain/feedback";
import type {
  ChangementStatut,
  FeedbackRepository,
  FiltreFeedback,
  PatchFeedback,
  RemonteeFeedback,
} from "@/lib/ports/feedback-repository";

const STORE = new Map<string, Feedback>();
let seq = 0;

function correspond(f: Feedback, filtre?: FiltreFeedback): boolean {
  if (!filtre) return true;
  if (filtre.statut && f.statut !== filtre.statut) return false;
  if (filtre.type && f.type !== filtre.type) return false;
  if (filtre.severite && f.severite !== filtre.severite) return false;
  return true;
}

function parDateDesc(a: Feedback, b: Feedback): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

export class MockFeedbackRepository implements FeedbackRepository {
  async creer(remontee: RemonteeFeedback): Promise<Feedback> {
    seq += 1;
    const f: Feedback = {
      id: `fb-${seq}`,
      type: remontee.type,
      titre: remontee.titre,
      description: remontee.description,
      severite: remontee.severite,
      statut: "nouveau",
      createdAt: new Date().toISOString(),
      ...(remontee.page ? { page: remontee.page } : {}),
      ...(remontee.auteurEmail ? { auteurEmail: remontee.auteurEmail } : {}),
      ...(remontee.auteurInitiales ? { auteurInitiales: remontee.auteurInitiales } : {}),
    };
    STORE.set(f.id, f);
    return { ...f };
  }

  async lister(filtre?: FiltreFeedback): Promise<Feedback[]> {
    return [...STORE.values()]
      .filter((f) => correspond(f, filtre))
      .sort(parDateDesc)
      .map((f) => ({ ...f }));
  }

  async get(id: string): Promise<Feedback | null> {
    const f = STORE.get(id);
    return f ? { ...f } : null;
  }

  async changerStatut(id: string, statut: StatutFeedback, opts: ChangementStatut): Promise<Feedback | null> {
    const f = STORE.get(id);
    if (!f) return null;
    const maj: Feedback = {
      ...f,
      statut,
      updatedAt: new Date().toISOString(),
      ...(opts.raisonEcart ? { raisonEcart: opts.raisonEcart } : {}),
      ...(opts.livreAt ? { livreAt: opts.livreAt } : {}),
    };
    STORE.set(id, maj);
    return { ...maj };
  }

  async patch(id: string, patch: PatchFeedback): Promise<Feedback | null> {
    const f = STORE.get(id);
    if (!f) return null;
    const maj: Feedback = { ...f, updatedAt: new Date().toISOString() };
    if (patch.titre !== undefined) maj.titre = patch.titre;
    if (patch.noteInterne !== undefined) maj.noteInterne = patch.noteInterne;
    if (patch.priorite !== undefined) {
      if (patch.priorite === null) delete maj.priorite;
      else maj.priorite = patch.priorite;
    }
    STORE.set(id, maj);
    return { ...maj };
  }

  async listerPublic(): Promise<Feedback[]> {
    return [...STORE.values()]
      .filter((f) => estStatutPublic(f.statut))
      .sort(parDateDesc)
      .map((f) => ({ ...f }));
  }
}
