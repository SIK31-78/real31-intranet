// Service : la worklist de triage admin (toutes les remontees). Tri metier applique
// via le domaine (le plus grave d'abord, puis le plus recent). Passe par le routeur.

import { getFeedbackRepository } from "@/lib/adapters/router";
import { trierTriage, type Feedback } from "@/lib/domain/feedback";
import type { FiltreFeedback } from "@/lib/ports/feedback-repository";

export async function getFeedbackAdmin(filtre?: FiltreFeedback): Promise<Feedback[]> {
  const liste = await getFeedbackRepository().lister(filtre);
  return [...liste].sort(trierTriage);
}
