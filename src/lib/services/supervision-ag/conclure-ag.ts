import { coproCodeDeAgId, type SupervisionAg, type VisaFinal } from "@/lib/domain/supervision-ag";
import { getSupervisionAgProvider } from "@/lib/adapters/router";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";

export async function conclureAg(
  agId: string,
  visa: VisaFinal,
  managerId: string,
): Promise<SupervisionAg> {
  await exigerPerimetre(coproCodeDeAgId(agId), managerId);
  return getSupervisionAgProvider().conclureAg(agId, visa);
}
