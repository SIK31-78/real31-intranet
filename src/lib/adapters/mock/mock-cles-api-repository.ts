// Adapter mock des cles API (STORE module-level, comme les autres mocks : les cles
// creees persistent entre les requetes tant que le process tourne). Sert au dev local
// ET aux tests offline (les handlers /api/v1 testes passent par le routeur -> ce mock).

import type { CleApi } from "@/lib/domain/cle-api";
import type {
  CleApiSecrete,
  ClesApiRepository,
  CreationCleApi,
} from "@/lib/ports/cles-api-repository";

const STORE = new Map<string, CleApiSecrete>();
let seq = 0;

function sansHash(c: CleApiSecrete): CleApi {
  const copie: CleApi & { cleHash?: string } = { ...c };
  delete copie.cleHash;
  return copie;
}

export class MockClesApiRepository implements ClesApiRepository {
  async creer(input: CreationCleApi): Promise<CleApi> {
    seq += 1;
    const cle: CleApiSecrete = {
      id: `cle-${seq}`,
      nom: input.nom,
      cleHash: input.cleHash,
      prefixe: input.prefixe,
      scopes: [...input.scopes],
      createdAt: new Date().toISOString(),
      usageJour: 0,
      ...(input.managerId ? { managerId: input.managerId } : {}),
      ...(input.creePar ? { creePar: input.creePar } : {}),
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    };
    STORE.set(cle.id, cle);
    return sansHash(cle);
  }

  async lister(): Promise<CleApi[]> {
    return [...STORE.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .map(sansHash);
  }

  async revoquer(id: string, nowISO: string): Promise<void> {
    const cle = STORE.get(id);
    if (!cle || cle.revokedAt) return;
    STORE.set(id, { ...cle, revokedAt: nowISO });
  }

  async findByHash(hash: string): Promise<CleApiSecrete | null> {
    for (const cle of STORE.values()) {
      if (cle.cleHash === hash) return { ...cle, scopes: [...cle.scopes] };
    }
    return null;
  }

  async enregistrerUsage(
    id: string,
    lastUsedAtISO: string,
    usageJour: number,
    usageJourDateISO: string,
  ): Promise<void> {
    const cle = STORE.get(id);
    if (!cle) return;
    STORE.set(id, { ...cle, lastUsedAt: lastUsedAtISO, usageJour, usageJourDate: usageJourDateISO });
  }
}
