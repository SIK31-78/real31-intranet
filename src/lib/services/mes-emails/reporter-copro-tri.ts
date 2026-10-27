// Changer la copro d'un mail dans « E-mails » la reporte dans le tri (13/10/2026) : sans ça,
// la correction restait propre au gestionnaire (état de « Mes e-mails »), le collègue du
// binôme voyait encore l'ancienne copro et le tri comptait sa suggestion comme suivie.
// Seulement pour la boîte partagée du tri, et seulement pour un mail distribué à MES binômes.

import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { boiteTri } from "@/lib/domain/mail-gate";
import { corrigerCopro } from "@/lib/services/tri-emails/ranger";
import { mailDistribue } from "./boites-visibles";

export async function reporterCoproAuTri(
  g: Pick<Gestionnaire, "email">,
  boite: string,
  internetMessageId: string,
  code: string,
): Promise<{ corrige: boolean; autreDossier?: string; reference?: string }> {
  // Une boîte triée (config), et un mail distribué à MES binômes : c'est ce qui borne le geste,
  // quelle que soit la boîte que la personne voit (27/10/2026).
  const b = boite.trim().toLowerCase();
  if (!boiteTri(b)) return { corrige: false };
  if (!(await mailDistribue(g, b, internetMessageId))) return { corrige: false };
  return corrigerCopro(b, internetMessageId, code);
}
