// Port (contrat) d'ECRITURE de la comptabilite eStale, dedie a la reprise. C'est le
// pendant compta de estale-ecriture-provider (patrimoine) : memes regles de prudence.
//
//   - DRY-RUN par defaut : le routeur ne choisit l'adapter reel que si ESTALE_ECRITURE=reel
//     ET les identifiants eStale sont presents (meme gate que le patrimoine).
//   - GRANULAIRE, jamais bulk : chaque ecriture rend son ID (createEntryExpert), donc
//     rollback possible ligne a ligne (updateEntry.delete - demontre par la sonde SE999
//     du 2026-08-18, premiere execution reelle). importEntries (bulk) ne rend AUCUN id :
//     ecarte par l'etude de faisabilite, on ne l'expose pas.
//   - Le PREREQUIS d'etat (exercice couvrant chaque date, ni verrouille ni clos) se verifie
//     AVANT d'appeler ce port, via lireExercices (port de lecture) + verifierExercicesPourDates
//     (domaine). La sonde a montre qu'un exercice verrouille refuse tout avec une erreur
//     opaque : on ne decouvre pas ca en plein milieu de 300 mutations.
//
// Le service ne connait QUE ce contrat ; il ignore le client GraphQL concret (hexagonal,
// ADR-001). Les types manipules vivent ici, pas dans le schema eStale genere.
//
// HORS CONTRAT (volontairement) : createEntryDispatch (eclatement bloc C) - sa semantique
// n'est pas prouvee (etude de faisabilite) ; il entrera au port quand elle l'aura ete sur
// copro test, sinon le fallback documente est le module Eclatement de l'UI eStale.

// Le type JournalEcriture vit dans le DOMAINE (journal-reprise.ts, avec la regle de
// derivation) ; le port le re-exporte pour ses signatures - une seule definition.
import type { JournalEcriture } from "@/lib/reprise/domain/journal-reprise";
export type { JournalEcriture };

/** Une ecriture granulaire (createEntryExpert). Montant POSITIF, le sens est porte a part. */
export interface EcritureExpertEstale {
  condoID: string;
  /** Date ISO "AAAA-MM-JJ". DOIT tomber dans un exercice existant et deverrouille. */
  date: string;
  libelle: string;
  /** Montant strictement positif. */
  montant: number;
  mouvement: "debit" | "credit";
  /** Journal : "carryforward" pour les a-nouveaux, "general"/"purchase"/"bank"... sinon. */
  journal: JournalEcriture;
  /** Compte cible eStale (AccountingAccount.id - une FEUILLE inscriptible). */
  accountID: string;
  /** Cle de repartition. Facultative au schema, mais les comptes portent la leur. */
  dkID?: string;
  /** TVA / part recuperable / part deductible (bloc B, issues du RGD). */
  tva?: number;
  recuperable?: number;
  deductible?: number;
  /** Numero de piece imprime par le syndic sortant, si capture. */
  piece?: string;
}

/** Creation d'un fournisseur (mapping 401 sans candidat). */
export interface FournisseurCreationEstale {
  /** Rattachement copro (createSupplier accepte un condoID optionnel - on le fournit toujours). */
  condoID: string;
  nom: string;
  /** Etablissement gestionnaire (obligatoire au schema). */
  establishmentID: string;
  /** Adresse (AddressInput eStale : postcode/city/country obligatoires, rue facultative). */
  adresse: { street?: string; postcode: string; city: string; country: string };
}

/** Creation d'un SOUS-COMPTE (updateAccountingAccount.append) : comptes d'attente 471999-XX,
 *  compte separe d'un coproprietaire a comptes multiples... */
export interface SousCompteCreationEstale {
  /** Compte PARENT (AccountingAccount.id). */
  parentAccountID: string;
  dkID: string;
  /** Suffixe ajoute a la nomenclature du parent (ex. "00"). */
  suffixe: string;
  nom: string;
}

export interface EstaleComptaEcritureProvider {
  /** Cree UNE ecriture et rend son id (capture pour rollback). */
  creerEcriture(input: EcritureExpertEstale): Promise<{ id: string }>;

  /** Supprime une ecriture par id (rollback cible, updateEntry.delete). */
  supprimerEcriture(id: string): Promise<void>;

  /** Cree un fournisseur et rend id + reference (la reference sert au mapping 401). */
  creerFournisseur(input: FournisseurCreationEstale): Promise<{ id: string; reference: string }>;

  /** Cree un sous-compte sous un parent et rend id + nomenclature complete. */
  creerSousCompte(input: SousCompteCreationEstale): Promise<{ id: string; nomenclature: string }>;
}
