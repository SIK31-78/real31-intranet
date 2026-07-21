// Adapter mock du recap AG : recaps accumules en memoire. Dev sans base.

import type {
  NouveauRecapAg,
  RecapAgHistorique,
  RecapAgRepository,
  StatutRecapAg,
} from "@/lib/ports/recap-ag-repository";

type RecapMock = NouveauRecapAg & { id: string; factureId?: string; creeLe: string };

export class MockRecapAgRepository implements RecapAgRepository {
  readonly recaps: RecapMock[] = [];

  async existeRecap(coproCode: string, agDate: string): Promise<boolean> {
    return this.recaps.some((r) => r.coproCode === coproCode && r.agDate === agDate);
  }

  async creerRecapAg(input: NouveauRecapAg): Promise<string> {
    const id = `recap-mock-${this.recaps.length + 1}`;
    this.recaps.push({ ...input, id, creeLe: new Date().toISOString() });
    return id;
  }

  async rattacherFacture(recapId: string, factureId: string, statut: StatutRecapAg): Promise<void> {
    const r = this.recaps.find((x) => x.id === recapId);
    if (r) {
      r.factureId = factureId;
      r.statut = statut;
    }
  }

  async listerRecapsRecents(limite = 50): Promise<RecapAgHistorique[]> {
    return [...this.recaps].reverse().slice(0, limite).map((r) => ({
      id: r.id,
      coproCode: r.coproCode,
      agDate: r.agDate,
      statut: r.statut,
      depassementHeures: r.depassementHeures,
      depassementTtc: r.depassementTtc,
      nbTravaux: r.travaux.length,
      ...(r.factureId ? { factureId: r.factureId } : {}),
      ...(r.par ? { par: r.par } : {}),
      creeLe: r.creeLe,
    }));
  }
}
