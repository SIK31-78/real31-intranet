// Adapter DRY-RUN du port EstaleEcritureProvider : AUCUN reseau, AUCUN client GraphQL.
// Il fabrique des IDs/references DETERMINISTES (lot#1 / ref L001, cle#1 / code inchange,
// owner#1 / ref O001) et journalise chaque operation dans l'ordre d'appel. Deroule ainsi
// le service d'injection pour obtenir le PLAN complet sans effet de bord.
//
// Sert a deux choses :
//   - prouver le cablage par ID (les IDs fabriques ici se retrouvent dans les tantiemes/links) ;
//   - servir de squelette de reference pour l'adapter reel (memes signatures).

import type {
  EstaleEcritureProvider,
  LotInputEstale,
  DKInputEstale,
  OwnerInputEstale,
  AddressInputEstale,
  LotOwnerInputEstale,
} from "@/lib/reprise/ports/estale-ecriture-provider";

/** Une entree du journal dry-run (trace lisible de ce qui aurait ete envoye a eStale). */
export type EntreeJournal =
  | { type: "creerLot"; condoID: string; input: LotInputEstale; sortie: { id: string; reference: string } }
  | { type: "creerCle"; condoID: string; input: DKInputEstale; sortie: { id: string; code: string } }
  | { type: "poserTantieme"; dkID: string; lotID: string; share: number }
  | {
      type: "creerOwner";
      condoID: string;
      owner: OwnerInputEstale;
      address: AddressInputEstale;
      sortie: { id: string; reference: string };
    }
  | { type: "relierOwnerAuLot"; lotID: string; data: LotOwnerInputEstale[] };

/**
 * Implementation en memoire du port. Deterministe : les compteurs demarrent a 1 et les
 * references sont zero-paddees (L001, O001...). Idempotent au sens ou une meme sequence
 * d'appels produit exactement le meme journal.
 */
export class DryRunEstaleEcritureProvider implements EstaleEcritureProvider {
  readonly journal: EntreeJournal[] = [];

  private nbLots = 0;
  private nbCles = 0;
  private nbOwners = 0;
  private nbTantiemes = 0;
  private nbLinks = 0;

  private static ref(prefixe: string, n: number): string {
    return `${prefixe}${String(n).padStart(3, "0")}`;
  }

  async creerLot(condoID: string, input: LotInputEstale): Promise<{ id: string; reference: string }> {
    this.nbLots += 1;
    const sortie = { id: `lot#${this.nbLots}`, reference: DryRunEstaleEcritureProvider.ref("L", this.nbLots) };
    this.journal.push({ type: "creerLot", condoID, input, sortie });
    return sortie;
  }

  async creerCle(condoID: string, input: DKInputEstale): Promise<{ id: string; code: string }> {
    this.nbCles += 1;
    // On renvoie le code demande (eStale conserve le code fourni) ; l'ID est fabrique.
    const sortie = { id: `cle#${this.nbCles}`, code: input.code };
    this.journal.push({ type: "creerCle", condoID, input, sortie });
    return sortie;
  }

  async poserTantieme(dkID: string, lotID: string, share: number): Promise<void> {
    this.nbTantiemes += 1;
    this.journal.push({ type: "poserTantieme", dkID, lotID, share });
  }

  async creerOwner(
    condoID: string,
    owner: OwnerInputEstale,
    address: AddressInputEstale,
  ): Promise<{ id: string; reference: string }> {
    this.nbOwners += 1;
    const sortie = { id: `owner#${this.nbOwners}`, reference: DryRunEstaleEcritureProvider.ref("O", this.nbOwners) };
    this.journal.push({ type: "creerOwner", condoID, owner, address, sortie });
    return sortie;
  }

  async relierOwnerAuLot(lotID: string, data: LotOwnerInputEstale[]): Promise<void> {
    this.nbLinks += data.length;
    this.journal.push({ type: "relierOwnerAuLot", lotID, data });
  }
}
