// Service : deposer les captures d'ecran d'une remontee qui vient d'etre creee (REA-255).
// La remontee existe deja : un depot rate ne doit pas la faire perdre, il est seulement
// signale (le collaborateur peut renvoyer sa capture en reponse au ticket).

import { getFeedbackCaptureStore } from "@/lib/adapters/router";
import { cheminCapture, erreurCaptures } from "@/lib/domain/feedback-captures";

export interface CaptureRecue {
  contentType: string;
  contenu: Uint8Array;
}

/** Rend le nombre de captures deposees. Leve si les captures sont refusees (format, poids). */
export async function joindreCaptures(feedbackId: string, captures: readonly CaptureRecue[]): Promise<number> {
  const refus = erreurCaptures(captures.map((c) => ({ contentType: c.contentType, taille: c.contenu.byteLength })));
  if (refus) throw new Error(refus);
  const store = getFeedbackCaptureStore();
  let deposees = 0;
  for (const [i, c] of captures.entries()) {
    try {
      await store.televerser(cheminCapture(feedbackId, i, c.contentType), c.contenu, c.contentType);
      deposees++;
    } catch (e) {
      console.warn(`[feedback] capture ${i + 1} de ${feedbackId} non deposee : ${(e as Error).message}`);
    }
  }
  return deposees;
}
