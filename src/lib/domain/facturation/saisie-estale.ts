// Une facture REAL31 d'une copro ESTALE qui n'est JAMAIS partie dans ESTALE (REA-321).
// Avant le 08/10/2026 11 h 16, seule la gestion courante remontait : une prestation annexe
// émise plus tôt (suivi de sinistre S306) n'a ni écriture ESTALE ni erreur, et le bouton
// « Renvoyer dans ESTALE », réservé aux factures en erreur, ne la montrait pas.
// Pur.

export interface EtatSaisieEstale {
  statut: string;
  /** La copro est tenue dans ESTALE. */
  coproEstale: boolean;
  /** Une écriture ESTALE existe déjà. */
  saisie: boolean;
  /** Le dernier essai a échoué. */
  erreur: boolean;
}

/**
 * Facture émise, copro ESTALE, ni écriture ni essai : à envoyer à la main, après avoir
 * vérifié avec la compta qu'elle n'a pas été saisie par un autre chemin (BPO, Crypto).
 * Jamais incluse dans « Tout renvoyer » : chaque cas se décide.
 */
export function jamaisEnvoyeeDansEstale(f: EtatSaisieEstale): boolean {
  return f.statut === "facturee" && f.coproEstale && !f.saisie && !f.erreur;
}
