// Adapter Pennylane : cree des factures BROUILLON via l'API externe v2.
// Actif uniquement si PENNYLANE_API_KEY est configure (cf. routeur) ; sinon le
// NoopInvoicingProvider prend le relais.
//
// Le jeton vient de l'environnement, JAMAIS d'une table applicative : le legacy
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

  private entetes(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  /**
   * Resout l'identifiant NUMERIQUE du client Pennylane a partir de la reference
   * externe stockee sur la fiche copropriete (Copropriete.pennylaneId, un UUID).
   *
   * Deux appels sont necessaires, exactement comme le flow legacy : Pennylane
   * n'accepte pas la reference externe dans le corps de la facture, il faut son
   * `id` interne. Passer l'UUID directement en `customer_id` ne marche pas.
   */
  private async resoudreCustomerId(referenceExterne: string): Promise<string> {
    const filtre = JSON.stringify([
      { field: "external_reference", operator: "eq", value: referenceExterne },
    ]);
    const url = `${BASE_URL}/customers?sort=-id&filter=${encodeURIComponent(filtre)}`;

    const reponse = await fetch(url, { method: "GET", headers: this.entetes() });
    if (!reponse.ok) {
      const detail = await reponse.text().catch(() => "");
      throw new Error(
        `Recherche client Pennylane : HTTP ${reponse.status}${detail ? ` - ${detail.slice(0, 300)}` : ""}`,
      );
    }

    const corps = (await reponse.json()) as { items?: Array<{ id?: number | string }> };
    const id = corps.items?.[0]?.id;
    if (id === undefined || id === null) {
      throw new Error(
        `Client Pennylane introuvable pour la reference externe ${referenceExterne}.`,
      );
    }
    return String(id);
  }

  async creerFactureBrouillon(demande: DemandeEmission): Promise<ResultatEmission> {
    if (!this.apiKey) {
      throw new Error("Emission Pennylane : PENNYLANE_API_KEY absent de l'environnement.");
    }

    const customerId = await this.resoudreCustomerId(demande.clientRef);
    const payload = construirePayloadFacture({ ...demande, clientRef: customerId });

    const reponse = await fetch(`${BASE_URL}/customer_invoices`, {
      method: "POST",
      headers: this.entetes(),
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
