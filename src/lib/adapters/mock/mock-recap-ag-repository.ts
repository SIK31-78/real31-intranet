// Adapter mock du recap AG : recaps accumules en memoire. Dev sans base.
//
// STORE module-level (et non un champ d'instance) : le routeur construit un adapter neuf
// a chaque appel, donc un etat porte par l'instance serait perdu entre deux requetes -
// un recap enregistre n'apparaissait jamais dans l'historique ni dans la file comptable.
// Meme parti que mock-supervision-ag-provider.

import type {
  NouveauRecapAg,
  RecapAgDetail,
  RecapAgFileLigne,
  RecapAgHistorique,
  RecapAgRepository,
  StatutRecapAg,
} from "@/lib/ports/recap-ag-repository";

type RecapMock = NouveauRecapAg & {
  id: string;
  factureId?: string;
  creeLe: string;
  traiteLe?: string;
  traitePar?: string;
};

const RECAPS: RecapMock[] = [];

export class MockRecapAgRepository implements RecapAgRepository {
  /** Exposition du store pour les tests (l'ecriture passe par les methodes du port). */
  readonly recaps = RECAPS;

  async existeRecap(coproCode: string, agDate: string): Promise<boolean> {
    return RECAPS.some((r) => r.coproCode === coproCode && r.agDate === agDate);
  }

  async creerRecapAg(input: NouveauRecapAg): Promise<string> {
    const id = `recap-mock-${RECAPS.length + 1}`;
    RECAPS.push({ ...input, id, creeLe: new Date().toISOString() });
    return id;
  }

  async rattacherFacture(recapId: string, factureId: string, statut: StatutRecapAg): Promise<void> {
    const r = RECAPS.find((x) => x.id === recapId);
    if (r) {
      r.factureId = factureId;
      r.statut = statut;
    }
  }

  async listerRecapsRecents(limite = 50): Promise<RecapAgHistorique[]> {
    return [...RECAPS].reverse().slice(0, limite).map(ligne);
  }

  async getRecapAg(recapId: string): Promise<RecapAgDetail | null> {
    const r = RECAPS.find((x) => x.id === recapId);
    if (!r) return null;
    return {
      ...r,
      travaux: [...r.travaux],
    };
  }

  async listerRecapsPourFile(limite = 100): Promise<RecapAgFileLigne[]> {
    return [...RECAPS]
      .reverse()
      .slice(0, limite)
      .map((r) => ({
        ...ligne(r),
        ...(r.traiteLe ? { traiteLe: r.traiteLe } : {}),
        ...(r.traitePar ? { traitePar: r.traitePar } : {}),
      }));
  }

  async marquerTraite(recapId: string, traite: boolean, par: string): Promise<void> {
    const r = RECAPS.find((x) => x.id === recapId);
    if (!r) throw new Error(`Recap ${recapId} introuvable.`);
    if (traite) {
      r.traiteLe = new Date().toISOString();
      r.traitePar = par;
    } else {
      delete r.traiteLe;
      delete r.traitePar;
    }
  }
}

function ligne(r: RecapMock): RecapAgHistorique {
  return {
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
  };
}
