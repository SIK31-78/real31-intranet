// Adapter DRY-RUN du port EstaleComptaEcritureProvider : AUCUN reseau, AUCUN client
// GraphQL. IDs deterministes + journal des operations dans l'ordre d'appel - meme role que
// le dry-run patrimoine : derouler le service d'import pour obtenir le PLAN complet (et le
// montrer a l'humain) sans le moindre effet de bord.

import type {
  EstaleComptaEcritureProvider,
  EcritureExpertEstale,
  FournisseurCreationEstale,
  SousCompteCreationEstale,
} from "@/lib/reprise/ports/estale-compta-ecriture-provider";

/** Une entree du journal dry-run (trace lisible de ce qui SERAIT envoye a eStale). */
export type EntreeJournalCompta =
  | { type: "creerEcriture"; input: EcritureExpertEstale; sortie: { id: string } }
  | { type: "supprimerEcriture"; id: string }
  | { type: "creerFournisseur"; input: FournisseurCreationEstale; sortie: { id: string; reference: string } }
  | { type: "creerSousCompte"; input: SousCompteCreationEstale; sortie: { id: string; nomenclature: string } };

/**
 * Implementation en memoire du port. Deterministe : compteurs a 1, references zero-paddees.
 * Une meme sequence d'appels produit exactement le meme journal.
 */
export class DryRunEstaleComptaEcritureProvider implements EstaleComptaEcritureProvider {
  readonly journal: EntreeJournalCompta[] = [];

  private nbEcritures = 0;
  private nbFournisseurs = 0;
  private nbSousComptes = 0;

  async creerEcriture(input: EcritureExpertEstale): Promise<{ id: string }> {
    this.nbEcritures += 1;
    const sortie = { id: `dry-ecriture-${this.nbEcritures}` };
    this.journal.push({ type: "creerEcriture", input, sortie });
    return sortie;
  }

  async supprimerEcriture(id: string): Promise<void> {
    this.journal.push({ type: "supprimerEcriture", id });
  }

  async creerFournisseur(input: FournisseurCreationEstale): Promise<{ id: string; reference: string }> {
    this.nbFournisseurs += 1;
    const sortie = {
      id: `dry-fournisseur-${this.nbFournisseurs}`,
      reference: `F${String(this.nbFournisseurs).padStart(3, "0")}`,
    };
    this.journal.push({ type: "creerFournisseur", input, sortie });
    return sortie;
  }

  async creerSousCompte(input: SousCompteCreationEstale): Promise<{ id: string; nomenclature: string }> {
    this.nbSousComptes += 1;
    const sortie = {
      id: `dry-sous-compte-${this.nbSousComptes}`,
      // Nomenclature fabriquee : parent inconnu du dry (on n'a que son id) -> suffixe seul,
      // prefixe explicite pour qu'aucun aval ne la confonde avec une vraie nomenclature.
      nomenclature: `dry-${input.suffixe}`,
    };
    this.journal.push({ type: "creerSousCompte", input, sortie });
    return sortie;
  }
}
