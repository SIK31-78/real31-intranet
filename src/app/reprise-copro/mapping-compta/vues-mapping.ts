// Types de VUE + libelles + helpers partages de l'ecran de revue du mapping comptable.
// Extraits de revue-mapping-vue.tsx lors de la refonte 2026-08 (decoupage).

import type { CandidatCompte, CategorieCompte, PlanMapping, StatutMapping } from "@/lib/reprise/domain/mapping-compta";
import type { GrandLivreCompte } from "@/lib/reprise/domain/ecriture";

export interface Candidats {
  fournisseurs: CandidatCompte[];
  coproprietaires: CandidatCompte[];
  /** Comptes d'attente/regularisation 46x/47x existants (cibles "coproprietaire parti"). */
  partis: CandidatCompte[];
}

/** Un compte de classe 6/7 avec report non nul (signature "grand livre avant repartition"). */
export interface CompteAvantRepart {
  compte: string;
  reportDebit: number;
  reportCredit: number;
}

export interface Equilibre {
  equilibre: boolean;
  ecart: number;
}

/**
 * Ligne de balance par compte (artefact de verification de la comptable : elle valide la
 * balance de chaque compte, pas les ecritures une a une - regle REAL31).
 */
export interface LigneBalance {
  compte: string;
  intitule?: string;
  reportDebit: number;
  reportCredit: number;
  debitCalcule: number;
  creditCalcule: number;
  debitImprime?: number;
  creditImprime?: number;
  ecartDebit?: number;
  ecartCredit?: number;
  solde: number;
  statut: "ok" | "ecart" | "non_controle";
}

export interface DonneesRevue {
  code: string;
  plan: PlanMapping;
  candidats: Candidats;
  /** Grand livre groupe par compte source (colonnes debit/credit), issu de l'analyse. */
  grandLivre: Record<string, GrandLivreCompte>;
  /** Balance complete par compte (verification comptable). */
  balance: LigneBalance[];
  equilibre: Equilibre;
}

/** Formate un montant en euros (fr-FR) ; masque le 0 pour alleger les colonnes debit/credit. */
export function montantEuro(n: number): string {
  if (n === 0) return "";
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const CATEGORIE_LABEL: Record<CategorieCompte, string> = {
  fournisseur: "Fournisseur (401)",
  fnp_408: "Factures non parvenues (408)",
  coproprietaire: "Coproprietaire (450)",
  attente_ancien: "Compte d'attente (471)",
  attente_472: "Compte d'attente (472)",
  rompus_473: "Rompus (473 -> 488)",
  regularisation_489: "Regularisation (489)",
  banque: "Banque (512/502)",
  livret: "Livret (501)",
  autre_bloc_a: "Autre tiers / tresorerie (bloc A)",
  charge_bloc_b: "Charge (classe 6, bloc B)",
  hors_bloc_a: "Hors bloc A (classe 1/2/3/7)",
};

export const STATUT_LABEL: Record<StatutMapping, string> = {
  mappe: "Mappe",
  action_requise: "A creer",
  warning_appariement: "A valider",
  reporte_bloc_b: "Reporte (bloc B)",
  reporte_bloc_c: "Reporte (bloc C)",
  exclu: "Exclu (jamais repris)",
  non_mappe: "Non mappe",
};

/** Convertit la carte de decisions locale en tableau pour le domaine. */
