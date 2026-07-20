// Construction du payload Pennylane, isolee de l'appel HTTP pour rester testable
// sans reseau (meme esprit que le reste des adapters du projet).
//
// Cible : POST /api/external/v2/customer_invoices (creation d'un brouillon).
// Repris du flow legacy `[REAL] FacturationSyndic` / `Facturation Gestion Courante`.

import type { DemandeEmission } from "@/lib/ports/invoicing-provider";

export interface PennylaneLigne {
  label: string;
  quantity: number;
  raw_currency_unit_price: string;
  vat_rate: string;
}

export interface PennylaneInvoicePayload {
  draft: true;
  customer_id: string;
  date: string;
  label: string;
  invoice_lines: PennylaneLigne[];
}

/** Taux de TVA au format attendu par Pennylane ("FR_200" pour 20 %). */
export function tauxTvaPennylane(taux: number): string {
  const pourcent = Math.round(taux * 1000) / 10; // 0.2 -> 20
  return `FR_${String(pourcent).replace(".", "")}${Number.isInteger(pourcent) ? "00" : "0"}`;
}

/**
 * Construit le corps de la requete de creation de facture brouillon.
 *
 * `draft: true` est non negociable : on ne finalise jamais une facture
 * automatiquement, la validation reste un geste humain cote comptabilite.
 */
export function construirePayloadFacture(demande: DemandeEmission): PennylaneInvoicePayload {
  if (demande.lignes.length === 0) {
    throw new Error("Emission Pennylane : facture sans ligne, emission refusee.");
  }

  return {
    draft: true,
    customer_id: demande.clientRef,
    date: demande.dateFacture,
    label: demande.libelle,
    invoice_lines: demande.lignes.map((ligne) => ({
      label: ligne.description,
      quantity: ligne.quantite,
      // Montants transmis en chaine a 2 decimales : evite les surprises de
      // serialisation flottante sur des valeurs monetaires.
      raw_currency_unit_price: ligne.prixUnitaireHt.toFixed(2),
      vat_rate: tauxTvaPennylane(ligne.tauxTva),
    })),
  };
}
