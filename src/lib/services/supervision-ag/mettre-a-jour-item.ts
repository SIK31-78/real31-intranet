import type { StatutItem, SupervisionAg } from "@/lib/domain/supervision-ag";
import type { Auditeur } from "@/lib/ports/supervision-ag-provider";
import { getSupervisionAgProvider } from "@/lib/adapters/router";

export async function cocherItem(
  agId: string,
  itemId: string,
  statut: StatutItem,
  auditeur: Auditeur,
): Promise<SupervisionAg> {
  return getSupervisionAgProvider().setStatutItem(agId, itemId, statut, auditeur);
}

export async function commenterItem(
  agId: string,
  itemId: string,
  commentaire: string,
  auditeur: Auditeur,
): Promise<SupervisionAg> {
  return getSupervisionAgProvider().setCommentaireItem(
    agId,
    itemId,
    commentaire,
    auditeur,
  );
}
