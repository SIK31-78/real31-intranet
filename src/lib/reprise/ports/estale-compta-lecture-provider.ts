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
 * Un coproprietaire tel qu'eStale le connait, reduit a ce que la reprise consomme.
 *
 * DECOUVERTE (mesure S0303, 2026-08-18) : eStale cree lui-meme les comptes 450 de chaque
 * owner, SUFFIXES par sa reference (owner 0003 -> compte 4500003). La reference est donc
 * la cle qui derive le compte CIBLE sans aucun appariement de nom cote eStale - le nom ne
 * sert plus qu'a identifier quel owner correspond a quel compte 450 du grand livre SOURCE.
 */
export interface OwnerEstale {
  /** ID eStale (stable, PII-free). */
  id: string;
  /** Reference eStale (ex. "0003") : suffixe du compte 450 cible. */
  reference: string;
  /** Nom complet (fullname). PII : sert a l'appariement, jamais logue ni recopie en note. */
  nom: string;
}

/**
 * Contrat de lecture comptable. Quatre operations, toutes en lecture :
 *   - resoudreAccounting : CODE copro (S0XXX) -> exercice comptable courant ;
 *   - lireBalanceGlobale : la Accounting.balance d'eStale (garde-fou "balance a 0") ;
 *   - lireComptes        : les comptes de l'exercice avec debit/credit/solde ;
 *   - lireOwners         : les coproprietaires du condo (id, reference, nom) - fondation
 *     de la reprise compta DECOUPLEE du patrimoine (l'etat de reference est LU depuis
 *     eStale, jamais reconstruit depuis une extraction).
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

  /** Lit les coproprietaires (non archives) du condo. */
  lireOwners(ref: RefAccounting): Promise<OwnerEstale[]>;
}
