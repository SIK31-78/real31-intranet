// Captures des remontees : bucket Supabase Storage PRIVE « feedback » (REA-255), meme
// brique que les photos de cles (ADR-040). Le bucket est cree au premier depot s'il
// manque (comme le script d'import des photos de cles) : aucun SQL a passer.
// Le SDK Storage reste confine ici (boundaries).

import type { CaptureStockee, FeedbackCaptureStore } from "@/lib/ports/feedback-capture-store";
import { dossierCaptures, typeDeChemin } from "@/lib/domain/feedback-captures";
import { createSupabasePublicClient } from "./public-client";

export const BUCKET_FEEDBACK = "feedback";

export class SupabaseFeedbackCaptureStore implements FeedbackCaptureStore {
  async televerser(chemin: string, contenu: Uint8Array, contentType: string): Promise<void> {
    const sb = createSupabasePublicClient();
    let { error } = await sb.storage.from(BUCKET_FEEDBACK).upload(chemin, contenu, { contentType, upsert: true });
    if (error && /bucket not found/i.test(error.message)) {
      const cree = await sb.storage.createBucket(BUCKET_FEEDBACK, { public: false });
      if (cree.error && !/already exists/i.test(cree.error.message)) {
        throw new Error(`Bucket ${BUCKET_FEEDBACK} : ${cree.error.message}`);
      }
      ({ error } = await sb.storage.from(BUCKET_FEEDBACK).upload(chemin, contenu, { contentType, upsert: true }));
    }
    if (error) throw new Error(`Capture ${chemin} : ${error.message}`);
  }

  async lirePourRemontee(feedbackId: string): Promise<CaptureStockee[]> {
    const sb = createSupabasePublicClient();
    const dossier = dossierCaptures(feedbackId);
    const { data, error } = await sb.storage.from(BUCKET_FEEDBACK).list(dossier);
    if (error || !data) return [];
    const captures: CaptureStockee[] = [];
    for (const f of data.filter((x) => x.name && !x.name.startsWith(".")).sort((a, b) => a.name.localeCompare(b.name))) {
      const chemin = `${dossier}/${f.name}`;
      const telecharge = await sb.storage.from(BUCKET_FEEDBACK).download(chemin);
      if (telecharge.error || !telecharge.data) {
        console.warn(`[feedback] capture ${chemin} illisible : ${telecharge.error?.message ?? "vide"}`);
        continue;
      }
      captures.push({ chemin, contentType: typeDeChemin(chemin), contenu: new Uint8Array(await telecharge.data.arrayBuffer()) });
    }
    return captures;
  }
}
