// Les choix de l'offre (AG, debut, duree) voyagent dans l'URL : la page, l'apercu
// imprimable et le PDF les relisent tels quels, sans etat.
//
// Une date ABSENTE de l'URL est laissee au calcul (AG prevue, debut au lendemain de l'AG) ;
// une date presente mais VIDE (`?ag=`) a ete effacee expres : elle part en blanc sur le
// contrat, sans repli.

import { DUREE_MAX_CONTRAT_MOIS } from "@/lib/domain/contrat/cycle-contrat";
import type { OptionsOffre } from "@/lib/domain/proposition/offre";

export type ParamsOffre = { ag?: string; debut?: string; duree?: string };

export function lireOptionsOffre(sp: ParamsOffre): OptionsOffre {
  const jour = (v?: string) => (v === "" ? "" : v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const ag = jour(sp.ag);
  const debut = jour(sp.debut);
  const duree = Number(sp.duree);
  return {
    ...(ag !== undefined ? { dateAgISO: ag } : {}),
    ...(debut !== undefined ? { debutISO: debut } : {}),
    ...(Number.isInteger(duree) && duree > 0 && duree <= DUREE_MAX_CONTRAT_MOIS ? { dureeMois: duree } : {}),
  };
}

/** La query telle qu'elle se repasse d'une page a l'autre (`?ag=…&duree=…`, ou « »). Une date videe reste (`ag=`). */
export function queryOffre(sp: ParamsOffre): string {
  const q = new URLSearchParams(
    (["ag", "debut", "duree"] as const).filter((k) => typeof sp[k] === "string").map((k) => [k, sp[k]!] as [string, string]),
  ).toString();
  return q ? `?${q}` : "";
}
