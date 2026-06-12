// Services d'ecriture de l'etat ODJ : saisie d'un champ, retrait / restauration
// d'un point legal, report sans date. Passent par le routeur (ADR-001).

import { getOdjRepository } from "@/lib/adapters/router";
import { PREFIXE_POINT } from "@/lib/ports/odj-repository";

export async function saisirChampOdj(
  coproCode: string,
  agDateISO: string,
  champId: string,
  valeur: string,
  par: string,
): Promise<void> {
  return getOdjRepository().setChamp(coproCode, agDateISO, champId, valeur.trim() || null, par);
}

export async function retirerPointOdj(
  coproCode: string,
  agDateISO: string,
  pointId: string,
  retire: boolean,
  par: string,
): Promise<void> {
  // Toujours explicite ("retire" / "inclus") : certains points sont retires
  // d'office dans le catalogue (ex. fonds ALUR), restaurer doit primer le defaut.
  return getOdjRepository().setChamp(
    coproCode,
    agDateISO,
    `${PREFIXE_POINT}${pointId}`,
    retire ? "retire" : "inclus",
    par,
  );
}

export async function reporterOdjSansDate(
  coproCode: string,
  nouvelleDateISO: string,
): Promise<void> {
  return getOdjRepository().reporterSansDate(coproCode, nouvelleDateISO);
}
