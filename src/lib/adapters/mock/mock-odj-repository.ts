// Adapter mock de l'etat ODJ : STORE module-level (persiste tant que le serveur
// dev tourne, reset au restart).

import type { EtatChampOdj, OdjRepository } from "@/lib/ports/odj-repository";
import { ODJ_SANS_DATE } from "@/lib/ports/odj-repository";

const STORE = new Map<string, string>(); // "code|date|champ" -> valeur

function cle(code: string, date: string, champ: string): string {
  return `${code}|${date}|${champ}`;
}

export class MockOdjRepository implements OdjRepository {
  async getEtat(coproCode: string, agDateISO: string): Promise<EtatChampOdj[]> {
    const prefixe = `${coproCode}|${agDateISO}|`;
    return [...STORE.entries()]
      .filter(([k]) => k.startsWith(prefixe))
      .map(([k, v]) => ({ champId: k.slice(prefixe.length), valeur: v }));
  }

  async setChamp(
    coproCode: string,
    agDateISO: string,
    champId: string,
    valeur: string | null,
  ): Promise<void> {
    const k = cle(coproCode, agDateISO, champId);
    if (valeur === null || valeur === "") STORE.delete(k);
    else STORE.set(k, valeur);
  }

  async reporterSansDate(coproCode: string, nouvelleDateISO: string): Promise<void> {
    const prefixe = `${coproCode}|${ODJ_SANS_DATE}|`;
    for (const [k, v] of [...STORE.entries()]) {
      if (!k.startsWith(prefixe)) continue;
      STORE.set(cle(coproCode, nouvelleDateISO, k.slice(prefixe.length)), v);
      STORE.delete(k);
    }
  }
}
