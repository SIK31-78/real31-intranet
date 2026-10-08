// Adapter « sans ESTALE » : identifiants ESTALE absents (dev, demo). Aucune copro n'y
// est tenue, donc aucune facture n'y part - le service le traite comme « hors ESTALE ».

import type { ComptaEstaleProvider, ResultatDepotEstale } from "@/lib/ports/compta-estale-provider";

export class NoopComptaEstaleProvider implements ComptaEstaleProvider {
  async coproPresente(): Promise<boolean> {
    return false;
  }

  async deposerFacture(): Promise<ResultatDepotEstale> {
    throw new Error("ESTALE non configuré (ESTALE_EMAIL / ESTALE_PASSWORD absents).");
  }

  async deposerFactureACodifier(): Promise<{ depotId: string }> {
    throw new Error("ESTALE non configuré (ESTALE_EMAIL / ESTALE_PASSWORD absents).");
  }
}
