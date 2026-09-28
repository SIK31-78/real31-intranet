// Adapter mock de l'AG Estale (hors mode supabase/Estale) : pas d'AG -> null.

import type { AssembleeEstaleProvider } from "@/lib/ports/assemblee-estale-provider";
import type { AssembleeAg, CleRepartition } from "@/lib/domain/assemblee";

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
  // Quelques cles plausibles pour exercer les suggestions du recap AG en dev.
  async listerClesRepartition(): Promise<CleRepartition[]> {
    return [
      { id: "dk-1", nom: "Charges générales", code: "001", parDefaut: true },
      { id: "dk-2", nom: "Ascenseur", code: "002", parDefaut: false },
      { id: "dk-3", nom: "Bâtiment A", code: "003", parDefaut: false },
    ];
  }
}
