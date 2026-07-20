// Construction du payload Pennylane, isolee de l'appel HTTP pour rester testable
// sans reseau (meme esprit que le reste des adapters du projet).
//
// Cible : POST /api/external/v2/customer_invoices (creation d'un brouillon).
// Repris du flow legacy `[REAL] FacturationSyndic` / `Facturation Gestion Courante`.

import type { DemandeEmission } from "@/lib/ports/invoicing-provider";

export interface PennylaneLigne {
  label: string;
  description?: string;
  quantity: number;
  unit: string;
  raw_currency_unit_price: string;
  vat_rate: string;
}

export interface PennylaneInvoicePayload {
  draft: true;
  customer_id: string;
  date: string;
  deadline: string;
  currency: string;
  language: string;
  invoice_lines: PennylaneLigne[];
}

/** Delai de paiement applique par REAL31 : 60 jours (repris du flow legacy). */
const DELAI_PAIEMENT_JOURS = 60;

/** Ajoute n jours a une date ISO "YYYY-MM-DD" (calcul UTC, deterministe). */
function plusJoursISO(iso: string, n: number): string {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a ?? 1970, (m ?? 1) - 1, j ?? 1));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Taux de TVA au format attendu par Pennylane : "FR_" suivi du pourcentage x 10
 * ("FR_200" pour 20 %, "FR_55" pour 5,5 %). Un taux nul est envoye en "exempt".
 *
 * Format releve dans les appels du flow legacy en production
 * (mythec-refactor/powerapps/Workflows : "vat_rate": "FR_200" / "exempt").
 */
export function tauxTvaPennylane(taux: number): string {
  if (taux === 0) return "exempt";
  return `FR_${Math.round(taux * 1000)}`;
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
    // Champs exiges par le schema « Draft Customer Invoice » de l'API v2 :
    // sans deadline / currency / language, Pennylane rejette en 400 NotAnyOf.
    deadline: plusJoursISO(demande.dateFacture, DELAI_PAIEMENT_JOURS),
    currency: "EUR",
    language: "fr_FR",
    invoice_lines: demande.lignes.map((ligne) => ({
      label: ligne.description,
      description: demande.libelle,
      quantity: ligne.quantite,
      unit: "piece",
      // Montants transmis en chaine a 2 decimales : evite les surprises de
      // serialisation flottante sur des valeurs monetaires.
      raw_currency_unit_price: ligne.prixUnitaireHt.toFixed(2),
      vat_rate: tauxTvaPennylane(ligne.tauxTva),
    })),
  };
}
