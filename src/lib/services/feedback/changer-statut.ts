// Service : changer le statut d'une remontee. La transition est VALIDEE par le domaine
// (cycle de vie + "ecarter exige une raison") AVANT toute ecriture ; le passage a `livre`
// pose livre_at (date du changelog). Passe par le routeur (ADR-001).

import { getFeedbackRepository } from "@/lib/adapters/router";
import { verifierTransition, type Feedback, type RefusTransition, type StatutFeedback } from "@/lib/domain/feedback";

export type ResultatChangement =
  | { ok: true; feedback: Feedback }
  | { ok: false; refus: RefusTransition | "introuvable" };

export async function changerStatutFeedback(
  id: string,
  statut: StatutFeedback,
  opts: { raisonEcart?: string; par?: string } = {},
): Promise<ResultatChangement> {
  const repo = getFeedbackRepository();
  const actuel = await repo.get(id);
  if (!actuel) return { ok: false, refus: "introuvable" };

  const verdict = verifierTransition(actuel.statut, statut, { raisonEcart: opts.raisonEcart });
  if (!verdict.ok) return { ok: false, refus: verdict.refus };

  const maj = await repo.changerStatut(id, statut, {
    ...(opts.raisonEcart ? { raisonEcart: opts.raisonEcart } : {}),
    ...(opts.par ? { par: opts.par } : {}),
    // livre_at pose UNIQUEMENT au passage a `livre` : c'est la date affichee au changelog.
    ...(statut === "livre" ? { livreAt: new Date().toISOString() } : {}),
  });
  if (!maj) return { ok: false, refus: "introuvable" };
  return { ok: true, feedback: maj };
}
