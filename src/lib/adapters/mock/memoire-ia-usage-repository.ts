// Journal d'usage de l'IA en mémoire (dev local et tests) : même contrat que la table
// intranet_ia_usage, perdu au redémarrage.

import type { IaUsageRepository, LigneUsageIa } from "@/lib/ports/ia-usage-repository";

export class MemoireIaUsageRepository implements IaUsageRepository {
  constructor(readonly lignes: LigneUsageIa[] = []) {}

  async enregistrer(ligne: LigneUsageIa): Promise<void> {
    this.lignes.push(ligne);
  }

  async compterDuJour(gestionnaireId: string, fonction: string, jour: string): Promise<number> {
    return this.lignes.filter((l) => l.gestionnaireId === gestionnaireId && l.fonction === fonction && l.jour === jour).length;
  }
}
