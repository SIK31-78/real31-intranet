import type { SupervisionAg } from "@/lib/domain/supervision-ag";
import { getSupervisionAgProvider } from "@/lib/adapters/router";

export async function getSupervisionAg(
  agId: string,
  managerId?: string,
): Promise<SupervisionAg | undefined> {
  return getSupervisionAgProvider().getSupervision(agId, managerId);
}
