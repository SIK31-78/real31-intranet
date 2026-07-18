// Port (contrat) de LECTURE de la comptabilite eStale, dedie a la reprise. LECTURE
// SEULE : aucune methode n'ecrit, aucun gate ESTALE_ECRITURE. C'est la fondation des
// gardes-fou de la reprise comptable (mesurer une balance avant/apres).
//
// Le service ne connait QUE ce contrat ; il ignore le client GraphQL concret (hexagonal,
// ADR-001). Les types manipules (SoldeCompte) vivent dans le domaine reprise, pas dans le
// schema eStale genere : le port ne depend d'aucun type technique.
//
// FINDING SCHEMA (verifie dans docs/estale-schema.graphql) : eStale n'expose PAS de query
// racine `accounting(id)`. Le SEUL chemin vers un Accounting est `condo(id).accounting(id)`
// (ou `condo(id).accountingV2.exercice`). Il faut donc TOUJOURS le condoID pour relire un
// exercice : d'ou le handle RefAccounting { condoID, accountingID } transporte de bout en
// bout (au lieu du seul accountingID).

import type { SoldeCompte } from "@/lib/reprise/domain/compta";

/** Handle d'un exercice comptable eStale : le couple (condo, accounting) requis pour lire. */
export interface RefAccounting {
  /** ID du condo eStale (indispensable : pas de query racine accounting(id)). */
  condoID: string;
  /** ID de l'Accounting (exercice comptable) courant du condo. */
  accountingID: string;
}

/**
 * Contrat de lecture comptable. Trois operations, toutes en lecture :
 *   - resoudreAccounting : CODE copro (S0XXX) -> exercice comptable courant ;
 *   - lireBalanceGlobale : la Accounting.balance d'eStale (garde-fou "balance a 0") ;
 *   - lireComptes        : les comptes de l'exercice avec debit/credit/solde.
 *
 * Toute indisponibilite (eStale non configure, copro introuvable, panne reseau) se traduit
 * soit par null (resoudreAccounting : copro absente), soit par une erreur remontee a
 * l'appelant (le service la capte et degrade en {ok:false, message}).
 */
export interface EstaleComptaLectureProvider {
  /**
   * Resout un CODE copro (ex. "S0302") vers son exercice comptable COURANT.
   * Retourne null si la copro n'est pas (encore) dans eStale ou n'a pas d'exercice.
   */
  resoudreAccounting(coproCode: string): Promise<RefAccounting | null>;

  /** Lit Accounting.balance (le solde global de l'exercice tel qu'eStale le calcule). */
  lireBalanceGlobale(ref: RefAccounting): Promise<number>;

  /** Lit les comptes de l'exercice (AccountingAccount) : nomenclature, libelle, debit, credit, solde. */
  lireComptes(ref: RefAccounting): Promise<SoldeCompte[]>;
}
