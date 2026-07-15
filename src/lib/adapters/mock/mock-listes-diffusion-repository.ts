// Adapter mock des listes de diffusion Crypto : aucune liste (mode dev sans import).
// La cascade destinataires retombe alors sur "aucune adresse" -> saisie manuelle.

import type { ListesDiffusionProvider } from "@/lib/ports/listes-diffusion-provider";

export class MockListesDiffusionRepository implements ListesDiffusionProvider {
  async listeCSPourCopro(): Promise<null> {
    return null;
  }
}
