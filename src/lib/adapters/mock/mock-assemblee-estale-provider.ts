// Adapter mock de l'AG Estale (hors mode supabase/Estale) : pas d'AG -> null.

import type { AssembleeEstaleProvider } from "@/lib/ports/assemblee-estale-provider";
import type { AssembleeAg } from "@/lib/domain/assemblee";

export class MockAssembleeEstaleProvider implements AssembleeEstaleProvider {
  async getAssemblee(): Promise<AssembleeAg | null> {
    return null;
  }
  async appliquerOdj(): Promise<{ supprimees: number; ajoutees: number; dejaPresentes: number }> {
    return { supprimees: 0, ajoutees: 0, dejaPresentes: 0 };
  }
  // appliquerOdj ignore ses arguments en mock (signature complete cote port).
  async creerAssemblee(): Promise<string> {
    throw new Error("Création d'AG indisponible hors connexion Estale.");
  }
}
