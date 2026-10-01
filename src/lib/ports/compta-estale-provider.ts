// Port (contrat) de saisie des factures REAL31 dans la compta ESTALE de la copropriete
// (REA-11). Ne depend d'aucune techno : le service ne connait que cette interface (ADR-001).
//
// La facture arrive DEJA IMPUTEE (fournisseur REAL 31, comptes de charge, cle, TVA) et
// au statut « bon a payer » : personne n'a rien a saisir. Elle reste modifiable et
// supprimable dans ESTALE, comme une saisie manuelle (cf. docs/facturation-estale-spike.md).

import type { LigneChargeEstale } from "@/lib/domain/facturation/ventilation-estale";

export type { LigneChargeEstale };

export interface FactureFournisseurEstale {
  /** Code de la copropriete cote intranet (S300) ; l'adapter retrouve la copro ESTALE (S0300). */
  coproCode: string;
  /** Numero de la facture chez Pennylane (F-2026-09-46683) : piece comptable ESTALE. */
  numero: string;
  libelle: string;
  /** Date de facture, ISO "YYYY-MM-DD". */
  date: string;
  /** Echeance, ISO "YYYY-MM-DD". */
  echeance: string;
  lignes: LigneChargeEstale[];
  pdf: Uint8Array;
  nomFichier: string;
}

export interface ResultatDepotEstale {
  /** Identifiant de l'ecriture fournisseur creee (ou deja presente) chez ESTALE. */
  ecritureId: string;
  /** true si ESTALE avait DEJA une facture REAL 31 avec ce numero : rien n'a ete recree. */
  dejaPresente: boolean;
}

export interface ComptaEstaleProvider {
  /** La copropriete est-elle tenue dans ESTALE ? Les autres ont leur propre processus. */
  coproPresente(coproCode: string): Promise<boolean>;
  /**
   * Cree la facture fournisseur REAL 31 dans la compta de la copropriete, au statut
   * « bon a payer ». Refuse (exception au message lisible) si le referentiel manque
   * (fournisseur, compte) ou si l'exercice de la date est verrouille ou clos.
   * Idempotent sur le numero : une facture deja presente n'est pas recreee.
   */
  deposerFacture(facture: FactureFournisseurEstale): Promise<ResultatDepotEstale>;
}
