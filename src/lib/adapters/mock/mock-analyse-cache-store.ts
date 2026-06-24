// Adapter mock du cache d'analyse : STORE module-level (le temps du dev server).

import type { AnalyseCachee, AnalyseCacheStore } from "@/lib/ports/analyse-cache-store";

const STORE = new Map<string, AnalyseCachee>();
const cle = (gid: string, imid: string) => `${gid}::${imid}`;

export class MockAnalyseCacheStore implements AnalyseCacheStore {
  async lirePar(gestionnaireId: string, internetMessageIds: string[]): Promise<Map<string, AnalyseCachee>> {
    const out = new Map<string, AnalyseCachee>();
    for (const id of internetMessageIds) {
      const a = STORE.get(cle(gestionnaireId, id));
      if (a) out.set(id, a);
    }
    return out;
  }
  async ecrire(gestionnaireId: string, analyse: AnalyseCachee): Promise<void> {
    STORE.set(cle(gestionnaireId, analyse.internetMessageId), analyse);
  }
}
