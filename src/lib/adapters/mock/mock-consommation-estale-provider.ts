// Doublure de la consommation ESTALE (REA-490) : sans ESTALE configure, aucune facture.
// Les tests y deposent les leurs.

import type { LigneConsommationEstale } from "@/lib/domain/facturation/frais-postaux-reels";
import type { ConsommationEstaleProvider, FactureEstaleRecue } from "@/lib/ports/consommation-estale-provider";

export class MockConsommationEstaleProvider implements ConsommationEstaleProvider {
  constructor(
    readonly factures: FactureEstaleRecue[] = [],
    readonly lignes: Map<string, LigneConsommationEstale[]> = new Map(),
    readonly mailings: Map<string, string[]> = new Map(),
  ) {}

  async listerFactures(): Promise<FactureEstaleRecue[]> {
    return [...this.factures].sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  }

  async lireConsommation(reference: string): Promise<LigneConsommationEstale[]> {
    const l = this.lignes.get(reference);
    if (!l) throw new Error(`Facture ESTALE ${reference} introuvable.`);
    return l;
  }

  async coprosDesMailings(): Promise<Map<string, string[]>> {
    return new Map(this.mailings);
  }
}
