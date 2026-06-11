// Service : reporte la prepa de supervision "sans date" (id = CODE seul) sur la
// supervision datee, quand une date d'AG est (re)fixee. Passe par le routeur.

import { getSupervisionAgProvider } from "@/lib/adapters/router";

export async function reporterSupervisionSansDate(
  coproCode: string,
  nouvelleDateISO: string,
): Promise<void> {
  return getSupervisionAgProvider().reporterSansDate(coproCode, nouvelleDateISO);
}
