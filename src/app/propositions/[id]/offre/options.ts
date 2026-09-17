// Les choix de l'offre (AG, debut, duree) voyagent dans l'URL : la page, l'apercu
// imprimable et le PDF les relisent tels quels, sans etat.

import type { OptionsOffre } from "@/lib/domain/proposition/offre";

export type ParamsOffre = { ag?: string; debut?: string; duree?: string };

export function lireOptionsOffre(sp: ParamsOffre): OptionsOffre {
  const jour = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const duree = Number(sp.duree);
  return {
    ...(jour(sp.ag) ? { dateAgISO: jour(sp.ag) } : {}),
    ...(jour(sp.debut) ? { debutISO: jour(sp.debut) } : {}),
    ...(Number.isInteger(duree) && duree > 0 ? { dureeMois: duree } : {}),
  };
}

/** La query telle qu'elle se repasse d'une page a l'autre (`?ag=…&duree=…`, ou « »). */
export function queryOffre(sp: ParamsOffre): string {
  const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return q ? `?${q}` : "";
}
