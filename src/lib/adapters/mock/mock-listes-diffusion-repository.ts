// Adapter mock des listes de diffusion Crypto. Par defaut aucune liste (mode dev sans
// import) -> la cascade destinataires retombe sur "aucune adresse" (saisie manuelle).
//
// Depuis le versant ECRITURE : garde en memoire (par instance) ce qui a ete enregistre,
// pour que remplacerListeCS puis listeCSPourCopro se repondent dans un meme test / une
// meme requete. En prod le routeur cree une instance neuve par appel -> etat transitoire,
// comportement inchange (lecture vide tant qu'aucune ecriture).

import type { ListesDiffusionProvider, ListeCSCopro } from "@/lib/ports/listes-diffusion-provider";
import { normaliserRefCopro } from "@/lib/domain/listes-diffusion";

export class MockListesDiffusionRepository implements ListesDiffusionProvider {
  private readonly memoire = new Map<string, string[]>();

  async listeCSPourCopro(coproCode: string): Promise<ListeCSCopro | null> {
    const code = normaliserRefCopro(coproCode);
    const emails = this.memoire.get(code);
    if (!emails || emails.length === 0) return null;
    return { coproCode: code, designation: `Conseil syndical - ${code} (intranet)`, emails };
  }

  async remplacerListeCS(coproCode: string, emails: string[]): Promise<void> {
    this.memoire.set(normaliserRefCopro(coproCode), emails);
  }
}
