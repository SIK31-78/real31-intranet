// Adapter REEL du port EstaleComptaEcritureProvider : chaque methode = UNE mutation GraphQL
// eStale, via le client authentifie estaleGql. Miroir des conventions du provider patrimoine
// (estale-ecriture/reel-provider) : throttle ~25 ms sous le plafond 50 req/s (ADR-022), et
// JAMAIS instancie par defaut - le routeur ne le choisit que si ESTALE_ECRITURE=reel ET les
// identifiants sont presents. Le DRY-RUN reste le defaut.
//
// ATTENTION : ce provider ECRIT dans l'eStale de PRODUCTION du cabinet.
//
// Sonde SE999 (2026-08-18, premiere execution reelle de createEntryExpert) - trois lecons
// gravees ici :
//   - une date hors de tout exercice est REFUSEE ; un exercice verrouille refuse TOUT ;
//   - l'erreur eStale est OPAQUE ("Oupss") dans les deux cas -> le prerequis d'etat se
//     verifie AVANT l'import (lireExercices + verifierExercicesPourDates), ce provider ne
//     tente pas d'interpreter les refus ;
//   - updateEntry.delete fonctionne : chaque id capture est un rollback possible.
//
// Mutations verifiees contre docs/estale-schema.graphql ET l'introspection live (NE PAS
// deviner) : createEntryExpert / updateEntry.delete / createSupplier / updateAccountingAccount.append.

import { estaleGql } from "@/lib/adapters/estale/client";
import type {
  EstaleComptaEcritureProvider,
  EcritureExpertEstale,
  FournisseurCreationEstale,
  SousCompteCreationEstale,
} from "@/lib/reprise/ports/estale-compta-ecriture-provider";

const M_CREATE_ENTRY_EXPERT = `mutation($input: EntryExpertCreateInput!) {
  createEntryExpert(input: $input) { id }
}`;
const M_DELETE_ENTRY = `mutation($id: ID!) { updateEntry(id: $id) { delete { id } } }`;
const M_CREATE_SUPPLIER = `mutation($input: SupplierCreateInput!, $condoID: ID) {
  createSupplier(input: $input, condoID: $condoID) { id reference }
}`;
const M_APPEND_ACCOUNT = `mutation($id: ID!, $input: AccountingAccountInput!) {
  updateAccountingAccount(id: $id) { append(input: $input) { id nomenclature } }
}`;

type CreateEntryData = { createEntryExpert: { id: string } };
type DeleteEntryData = { updateEntry: { delete: { id: string }[] } };
type CreateSupplierData = { createSupplier: { id: string; reference: string } };
type AppendAccountData = { updateAccountingAccount: { append: { id: string; nomenclature: string } } };

/** Espacement minimal entre deux appels (ms) : <= 40 req/s, marge sous le plafond de 50. */
const ESPACEMENT_MIN_MS = 25;

export class ReelEstaleComptaEcritureProvider implements EstaleComptaEcritureProvider {
  private dernierAppel = 0;

  private async throttle(): Promise<void> {
    const maintenant = Date.now();
    const attente = this.dernierAppel + ESPACEMENT_MIN_MS - maintenant;
    if (attente > 0) await new Promise((r) => setTimeout(r, attente));
    this.dernierAppel = Date.now();
  }

  /** Un appel GraphQL throttle. Les erreurs de estaleGql remontent telles quelles. */
  private async appel<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    await this.throttle();
    return estaleGql<T>(query, variables);
  }

  async creerEcriture(input: EcritureExpertEstale): Promise<{ id: string }> {
    const data = await this.appel<CreateEntryData>(M_CREATE_ENTRY_EXPERT, {
      input: {
        condoID: input.condoID,
        date: input.date,
        label: input.libelle,
        amount: input.montant,
        movement: input.mouvement.toUpperCase(),
        ledger: input.journal.toUpperCase(),
        accountID: input.accountID,
        ...(input.dkID ? { dkID: input.dkID } : {}),
        ...(input.tva !== undefined ? { vat: input.tva } : {}),
        ...(input.recuperable !== undefined ? { recoverable: input.recuperable } : {}),
        ...(input.deductible !== undefined ? { deductible: input.deductible } : {}),
        ...(input.piece ? { piece: input.piece } : {}),
      },
    });
    return { id: data.createEntryExpert.id };
  }

  async supprimerEcriture(id: string): Promise<void> {
    await this.appel<DeleteEntryData>(M_DELETE_ENTRY, { id });
  }

  async creerFournisseur(input: FournisseurCreationEstale): Promise<{ id: string; reference: string }> {
    const data = await this.appel<CreateSupplierData>(M_CREATE_SUPPLIER, {
      condoID: input.condoID,
      input: {
        category: "PROVIDER",
        name: input.nom,
        // initial=false : fournisseur cree au fil de la reprise, pas au parametrage initial ;
        // important=false : neutre, se coche dans l'UI eStale si besoin.
        initial: false,
        important: false,
        establishmentID: input.establishmentID,
        address: {
          ...(input.adresse.street ? { street: input.adresse.street } : {}),
          postcode: input.adresse.postcode,
          city: input.adresse.city,
          country: input.adresse.country,
        },
      },
    });
    return { id: data.createSupplier.id, reference: data.createSupplier.reference };
  }

  async creerSousCompte(input: SousCompteCreationEstale): Promise<{ id: string; nomenclature: string }> {
    const data = await this.appel<AppendAccountData>(M_APPEND_ACCOUNT, {
      id: input.parentAccountID,
      input: { dkID: input.dkID, suffix: input.suffixe, name: input.nom },
    });
    return {
      id: data.updateAccountingAccount.append.id,
      nomenclature: data.updateAccountingAccount.append.nomenclature,
    };
  }
}
