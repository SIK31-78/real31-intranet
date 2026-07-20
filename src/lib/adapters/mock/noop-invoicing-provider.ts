// Adapter d'emission "no-op" : ne contacte aucun service externe. Permet de
// derouler tout le parcours de facturation sans jeton Pennylane (dev / demo),
// comme NoopMailOutboundProvider cote mail.

import type {
  DemandeEmission,
  InvoicingProvider,
  ResultatEmission,
} from "@/lib/ports/invoicing-provider";

export class NoopInvoicingProvider implements InvoicingProvider {
  /** Emissions simulees pendant la session (inspectables en test). */
  readonly emissions: DemandeEmission[] = [];

  async creerFactureBrouillon(demande: DemandeEmission): Promise<ResultatEmission> {
    this.emissions.push(demande);
    // Pas de donnee client en log : seulement le volume.
    console.log(
      `[invoicing:noop] brouillon simule (${demande.lignes.length} ligne(s), ${demande.dateFacture})`,
    );
    return { factureExterneId: `noop-${this.emissions.length}` };
  }
}
