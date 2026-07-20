// Adapter Pennylane : cree des factures BROUILLON via l'API externe v2.
// Actif uniquement si PENNYLANE_API_KEY est configure (cf. routeur) ; sinon le
// NoopInvoicingProvider prend le relais.
//
// Le jeton vient de l'environnement, JAMAIS d'une table applicative — le legacy
// le stockait en clair dans la liste SharePoint « Parametres ».
// Cf. MIGRATION_PLAN.md §4.1.

import type {
  DemandeEmission,
  InvoicingProvider,
  ResultatEmission,
} from "@/lib/ports/invoicing-provider";
import { construirePayloadFacture } from "./payload";

const BASE_URL = "https://app.pennylane.com/api/external/v2";

export class PennylaneInvoicingProvider implements InvoicingProvider {
  constructor(private readonly apiKey = process.env.PENNYLANE_API_KEY ?? "") {}

  async creerFactureBrouillon(demande: DemandeEmission): Promise<ResultatEmission> {
    if (!this.apiKey) {
      throw new Error("Emission Pennylane : PENNYLANE_API_KEY absent de l'environnement.");
    }

    const payload = construirePayloadFacture(demande);

    const reponse = await fetch(`${BASE_URL}/customer_invoices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!reponse.ok) {
      // On remonte le corps de l'erreur : sans lui, un rejet Pennylane
      // (client inconnu, taux de TVA invalide...) est indebuggable.
      const detail = await reponse.text().catch(() => "");
      throw new Error(
        `Emission Pennylane : HTTP ${reponse.status} ${reponse.statusText}${detail ? ` - ${detail.slice(0, 500)}` : ""}`,
      );
    }

    const corps = (await reponse.json()) as { id?: number | string };
    if (corps.id === undefined || corps.id === null) {
      throw new Error("Emission Pennylane : reponse sans identifiant de facture.");
    }

    return { factureExterneId: String(corps.id) };
  }
}
