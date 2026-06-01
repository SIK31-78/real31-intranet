import type { SupervisionAg, VisaFinal } from "@/lib/domain/supervision-ag";
import { getSupervisionAgProvider } from "@/lib/adapters/router";

export async function conclureAg(
  agId: string,
  visa: VisaFinal,
): Promise<SupervisionAg> {
  return getSupervisionAgProvider().conclureAg(agId, visa);
}
