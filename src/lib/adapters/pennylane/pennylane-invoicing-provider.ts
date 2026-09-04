// Adapter Pennylane : emet les factures via l'API externe v2.
// Actif uniquement si PENNYLANE_API_KEY est configure (cf. routeur) ; sinon le
// NoopInvoicingProvider prend le relais.
//
// DEUX TEMPS, jamais un seul : POST /customer_invoices cree TOUJOURS un brouillon,
// puis PUT /customer_invoices/{id}/finalize le valide - et seulement si
// PENNYLANE_FACTURE_VALIDEE l'autorise (defaut : on s'arrete au brouillon).
// C'est le chemin documente par Pennylane, et il a un avantage decisif ici : notre
// identifiant de facture externe existe AVANT la validation, donc un echec de
// validation laisse une trace exploitable plutot qu'un trou.
//
// Le jeton vient de l'environnement, JAMAIS d'une table applicative : le legacy
// le stockait en clair dans la liste SharePoint « Parametres ».
// Cf. MIGRATION_PLAN.md §4.1.

import type {
  DemandeEmission,
  InvoicingProvider,
  ResultatEmission,
} from "@/lib/ports/invoicing-provider";
import { factureValideeActive } from "@/lib/domain/facturation/mode-emission";
import { construirePayloadFacture } from "./payload";

const BASE_URL = "https://app.pennylane.com/api/external/v2";

export class PennylaneInvoicingProvider implements InvoicingProvider {
  constructor(
    private readonly apiKey = process.env.PENNYLANE_API_KEY ?? "",
    /** Valider la facture juste apres sa creation (opt-in, cf. domain/facturation/mode-emission). */
    private readonly validerApresCreation = factureValideeActive(
      process.env.PENNYLANE_FACTURE_VALIDEE,
    ),
  ) {}

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

  /**
   * Valide (finalise) un brouillon : PUT /customer_invoices/{id}/finalize.
   *
   * IRREVERSIBLE cote Pennylane : la facture prend un numero et ne peut plus etre
   * modifiee ni supprimee. On ne l'appelle donc que sur opt-in explicite.
   */
  private async validerFacture(factureId: string): Promise<void> {
    const reponse = await fetch(
      `${BASE_URL}/customer_invoices/${encodeURIComponent(factureId)}/finalize`,
      { method: "PUT", headers: this.entetes() },
    );
    if (reponse.ok) return;

    const detail = await reponse.text().catch(() => "");
    // Le message NOMME le brouillon deja cree : sans lui, rejouer l'emission
    // creerait un second brouillon chez Pennylane sans que personne ne le voie.
    throw new Error(
      `Validation Pennylane de la facture ${factureId} : HTTP ${reponse.status} ${reponse.statusText}` +
        `${detail ? ` - ${detail.slice(0, 500)}` : ""}. ` +
        `Le BROUILLON ${factureId} EXISTE chez Pennylane : le valider ou le supprimer a la main ` +
        `avant de rejouer l'emission, sinon un doublon partira.`,
    );
  }

  async emettreFacture(demande: DemandeEmission): Promise<ResultatEmission> {
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
    const factureExterneId = String(corps.id);

    if (!this.validerApresCreation) return { factureExterneId, validee: false };

    await this.validerFacture(factureExterneId);
    return { factureExterneId, validee: true };
  }
}
