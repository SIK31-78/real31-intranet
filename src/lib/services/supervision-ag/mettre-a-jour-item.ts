import { coproCodeDeAgId, type StatutItem, type SupervisionAg } from "@/lib/domain/supervision-ag";
import type { Auditeur } from "@/lib/ports/supervision-ag-provider";
import { getSupervisionAgProvider } from "@/lib/adapters/router";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";

export async function cocherItem(
  agId: string,
  itemId: string,
  statut: StatutItem,
  auditeur: Auditeur,
  managerId: string,
): Promise<SupervisionAg> {
  await exigerPerimetre(coproCodeDeAgId(agId), managerId);
  return getSupervisionAgProvider().setStatutItem(agId, itemId, statut, auditeur);
}

export async function commenterItem(
  agId: string,
  itemId: string,
  commentaire: string,
  auditeur: Auditeur,
  managerId: string,
): Promise<SupervisionAg> {
  await exigerPerimetre(coproCodeDeAgId(agId), managerId);
  return getSupervisionAgProvider().setCommentaireItem(
    agId,
    itemId,
    commentaire,
    auditeur,
  );
}
