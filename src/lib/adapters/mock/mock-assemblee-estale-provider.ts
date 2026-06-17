// Adapter mock de l'AG eStale (hors mode supabase/eStale) : pas d'AG -> null.

import type { AssembleeEstaleProvider } from "@/lib/ports/assemblee-estale-provider";
import type { AssembleeAg } from "@/lib/domain/assemblee";

export class MockAssembleeEstaleProvider implements AssembleeEstaleProvider {
  async getAssemblee(): Promise<AssembleeAg | null> {
    return null;
  }
  async ajouterAuMeeting(): Promise<number> {
    return 0;
  }
}
