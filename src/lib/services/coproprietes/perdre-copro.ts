// Service : perdre une copropriete (Sekou, 15/09/2026).
//
// Une copro qui quitte le cabinet doit sortir de PARTOUT : facturation de gestion
// courante, alertes de mandat, listes. Tout l'intranet filtre sur Copropriete.status
// (App A) : c'est donc ce statut qu'on bascule, et on garde la trace de quand et pourquoi.
//
// Le declencheur : LAPROMENAD, plus geree depuis juin 2026, toujours ACTIVE - elle serait
// partie dans la prochaine fournee de gestion courante, cochee par « Tout selectionner ».
//
// Passe par le routeur (ADR-001). Habilitation verifiee par l'ACTION (comptabilite du
// cabinet / super-admin), pas ici.

import { getCoproRepository } from "@/lib/adapters/router";
import type { CoproPerdue, CoproPerdueInput } from "@/lib/ports/copro-repository";

const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function perdreCopro(input: CoproPerdueInput): Promise<void> {
  if (!JOUR_RE.test(input.finGestionISO)) {
    throw new Error("Perte de copropriété : date de fin de gestion illisible.");
  }
  const repo = getCoproRepository();
  const copro = await repo.findByCode(input.coproCode);
  if (!copro) throw new Error(`Perte de copropriété : ${input.coproCode} introuvable.`);
  if (copro.statut !== "active") {
    throw new Error(`Perte de copropriété : ${input.coproCode} est déjà inactive.`);
  }
  await repo.perdreCopro({ ...input, ...(input.motif?.trim() ? { motif: input.motif.trim() } : {}) });
}

/** Les dernieres pertes actees, pour que l'ecran montre ce qui vient d'etre fait. */
export function listerCoprosPerdues(limite = 10): Promise<CoproPerdue[]> {
  return getCoproRepository().listerCoprosPerdues(limite);
}
