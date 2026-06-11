// Adapter mock de l'etat des jalons : store en memoire (reset au restart dev).
// Cibles calculees par le domaine ; etat mocke (quelques jalons accomplis).

import type { EtatJalon, JalonRepository, MarquageJalon } from "@/lib/ports/jalon-repository";
import type { JalonAvecEtat, JalonCode, StatutJalon } from "@/lib/domain/jalons-ag/types";
import { calculerJalons } from "@/lib/domain/jalons-ag/calculator";

function cle(coproCode: string, agDate: string, type: string): string {
  return `${coproCode}|${agDate}|${type}`;
}

// Quelques etats de depart pour la demo.
const STORE = new Map<string, StatutJalon>([
  [cle("S104", "2026-05-28", "ODJ_CS"), "accompli"],
  [cle("S104", "2026-05-28", "DEVIS"), "accompli"],
  [cle("S104", "2026-05-28", "CONVOC"), "accompli"],
]);

export class MockJalonRepository implements JalonRepository {
  async getJalons(coproCode: string, agDateISO: string): Promise<JalonAvecEtat[]> {
    return calculerJalons(agDateISO).map((j) => ({
      ...j,
      statut: STORE.get(cle(coproCode, agDateISO, j.code)) ?? "a_faire",
    }));
  }

  async marquer({ coproCode, agDate, type, statut }: MarquageJalon): Promise<void> {
    STORE.set(cle(coproCode, agDate, type), statut);
  }

  async getEtats(coproCodes: string[]): Promise<EtatJalon[]> {
    const set = new Set(coproCodes);
    const out: EtatJalon[] = [];
    for (const [k, statut] of STORE) {
      const [coproCode, agDate, type] = k.split("|");
      if (set.has(coproCode)) out.push({ coproCode, agDate, type: type as JalonCode, statut });
    }
    return out;
  }
}
