// Doublure hors connexion ESTALE (REA-356) : aucune copro n'est « dans ESTALE », le
// compositeur garde l'annuaire Crypto (comportement d'avant). N'appelle rien.

import type { CoproprietaireJoignable, CoproprietairesEstaleProvider } from "@/lib/ports/coproprietaires-estale-provider";

export class MockCoproprietairesEstaleProvider implements CoproprietairesEstaleProvider {
  async listerJoignables(): Promise<CoproprietaireJoignable[] | null> {
    return null;
  }
}
