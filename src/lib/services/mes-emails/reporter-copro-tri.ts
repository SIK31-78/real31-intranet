// Changer la copro d'un mail dans « E-mails » la reporte dans le tri (13/10/2026) : sans ça,
// la correction restait propre au gestionnaire (état de « Mes e-mails »), le collègue du
// binôme voyait encore l'ancienne copro et le tri comptait sa suggestion comme suivie.
// Seulement pour la boîte partagée du tri, et seulement pour un mail distribué à MES binômes.

import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { corrigerCopro } from "@/lib/services/tri-emails/ranger";
import { boitesVisibles, distributionDe } from "./boites-visibles";

export async function reporterCoproAuTri(
  g: Pick<Gestionnaire, "email">,
  boite: string,
  internetMessageId: string,
  code: string,
): Promise<{ corrige: boolean; autreDossier?: string; reference?: string }> {
  const b = boite.trim().toLowerCase();
  const partagee = (await boitesVisibles(g)).find((x) => x.id === b && !x.personnelle);
  if (!partagee) return { corrige: false };
  if (!(await distributionDe(g, b)).has(internetMessageId)) return { corrige: false };
  return corrigerCopro(b, internetMessageId, code);
}
