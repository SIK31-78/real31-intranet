// Captures des remontees en memoire (mode mock / tests) : meme contrat que le bucket.

import type { CaptureStockee, FeedbackCaptureStore } from "@/lib/ports/feedback-capture-store";
import { dossierCaptures } from "@/lib/domain/feedback-captures";

const fichiers = new Map<string, { contentType: string; contenu: Uint8Array }>();

export class MockFeedbackCaptureStore implements FeedbackCaptureStore {
  async televerser(chemin: string, contenu: Uint8Array, contentType: string): Promise<void> {
    fichiers.set(chemin, { contentType, contenu });
  }

  async lirePourRemontee(feedbackId: string): Promise<CaptureStockee[]> {
    const prefixe = `${dossierCaptures(feedbackId)}/`;
    return [...fichiers.entries()]
      .filter(([chemin]) => chemin.startsWith(prefixe))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([chemin, f]) => ({ chemin, ...f }));
  }
}
