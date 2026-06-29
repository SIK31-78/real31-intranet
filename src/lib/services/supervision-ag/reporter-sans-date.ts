// Service : reporte la prepa de supervision "sans date" (id = CODE seul) sur la
// supervision datee, quand une date d'AG est (re)fixee. Passe par le routeur.

import { getSupervisionAgProvider } from "@/lib/adapters/router";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";

export async function reporterSupervisionSansDate(
  coproCode: string,
  nouvelleDateISO: string,
  managerId: string,
): Promise<void> {
  await exigerPerimetre(coproCode, managerId);
  return getSupervisionAgProvider().reporterSansDate(coproCode, nouvelleDateISO);
}
