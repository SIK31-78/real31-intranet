// Adapter d'emission "no-op" : ne contacte aucun service externe. Permet de
// derouler tout le parcours de facturation sans jeton Pennylane (dev / demo),
// comme NoopMailOutboundProvider cote mail.

import type {
  DemandeEmission,
  FactureEmise,
  NouveauClient,
  InvoicingProvider,
  ResultatEmission,
} from "@/lib/ports/invoicing-provider";

export class NoopInvoicingProvider implements InvoicingProvider {
  /** Emissions simulees pendant la session (inspectables en test). */
  readonly emissions: DemandeEmission[] = [];

  async creerClient(client: NouveauClient): Promise<{ clientExterneId: string }> {
    console.log(`[invoicing:noop] client simule (${client.referenceExterne})`);
    return { clientExterneId: `noop-client-${client.referenceExterne}` };
  }

  async emettreFacture(demande: DemandeEmission): Promise<ResultatEmission> {
    this.emissions.push(demande);
    // Pas de donnee client en log : seulement le volume.
    console.log(
      `[invoicing:noop] brouillon simule (${demande.lignes.length} ligne(s), ${demande.dateFacture})`,
    );
    // Toujours `validee: false` : le no-op ne simule jamais un engagement comptable.
    return { factureExterneId: `noop-${this.emissions.length}`, validee: false };
  }

  async lireFactureEmise(): Promise<FactureEmise> {
    // Un brouillon simule reste un brouillon : rien ne part vers ESTALE en simulation.
    const jour = new Date().toISOString().slice(0, 10);
    return { validee: false, date: jour, echeance: jour, montantTtc: 0 };
  }

  async telechargerPdf(): Promise<Uint8Array> {
    throw new Error("Mode simulation : aucun PDF de facture (PENNYLANE_API_KEY absente).");
  }
}
