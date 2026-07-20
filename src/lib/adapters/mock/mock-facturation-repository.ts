// Adapter mock de la facturation : bareme et contrats en memoire, factures
// accumulees dans un tableau. Sert au dev sans base et aux tests de service.

import type {
  ContratCopro,
  FactureAEmettre,
  FacturationRepository,
  NouvelleFacture,
} from "@/lib/ports/facturation-repository";

/** Bareme d'exemple (montants TTC), suffisant pour faire tourner les ecrans. */
const TARIFS: Record<string, Record<number, number>> = {
  TauxHoraire: { 2024: 90, 2025: 96, 2026: 102 },
  PreEtatDate: { 2024: 330, 2025: 345, 2026: 360 },
  EtatDate: { 2024: 390, 2025: 408, 2026: 426 },
  DossierAssureur: { 2024: 150, 2025: 156, 2026: 162 },
  DepLieu: { 2024: 120, 2025: 126, 2026: 132 },
  MesConser: { 2024: 180, 2025: 186, 2026: 192 },
  AssExp: { 2024: 210, 2025: 216, 2026: 222 },
};

const CONTRATS: ContratCopro[] = [
  { id: "contrat-mock-1", coproCode: "S016", debutContrat: "2025-07-01", honorairesGestionTtc: 4800, forfaitPostauxTtc: 360 },
  { id: "contrat-mock-2", coproCode: "S021", debutContrat: "2024-07-01", honorairesGestionTtc: 3600, forfaitPostauxTtc: 300 },
];

/** Identifiants client Pennylane d'exemple (Copropriete.pennylaneId en reel). */
const CLIENTS_FACTURATION: Record<string, string> = {
  S016: "penny-mock-016",
  S021: "penny-mock-021",
};

type FactureMock = NouvelleFacture & {
  id: string;
  statut: "a_facturer" | "facturee" | "erreur";
  factureExterneId?: string;
  erreur?: string;
};

export class MockFacturationRepository implements FacturationRepository {
  /** Factures creees pendant la session (inspectables en test). */
  readonly factures: FactureMock[] = [];

  async getTarifTtc(identifiantPrestation: string, annee: number): Promise<number | null> {
    return TARIFS[identifiantPrestation]?.[annee] ?? null;
  }

  async getDernierContrat(coproCode: string): Promise<ContratCopro | null> {
    const candidats = CONTRATS.filter((c) => c.coproCode === coproCode).sort((a, b) =>
      b.debutContrat.localeCompare(a.debutContrat),
    );
    return candidats[0] ?? null;
  }

  async creerFacture(input: NouvelleFacture): Promise<string> {
    const id = `facture-mock-${this.factures.length + 1}`;
    this.factures.push({ ...input, id, statut: "a_facturer" });
    return id;
  }

  async listerFacturesAEmettre(limite = 50): Promise<FactureAEmettre[]> {
    return this.factures
      .filter((f) => f.statut === "a_facturer")
      .slice(0, limite)
      .map((f) => ({
        id: f.id,
        coproCode: f.coproCode,
        libelle: f.libelle,
        dateFacture: f.dateFacture,
        lignes: f.lignes.map((l) => ({
          description: l.description,
          quantite: l.quantite,
          prixUnitaireHt: l.prixUnitaireHt,
          tauxTva: l.tauxTva ?? 0.2,
        })),
      }));
  }

  async getClientFacturationRef(coproCode: string): Promise<string | null> {
    return CLIENTS_FACTURATION[coproCode] ?? null;
  }

  async marquerFacturee(factureId: string, factureExterneId: string): Promise<void> {
    const facture = this.factures.find((f) => f.id === factureId);
    if (facture) {
      facture.statut = "facturee";
      facture.factureExterneId = factureExterneId;
    }
  }

  async marquerErreur(factureId: string, message: string): Promise<void> {
    const facture = this.factures.find((f) => f.id === factureId);
    if (facture) {
      facture.statut = "erreur";
      facture.erreur = message;
    }
  }
}
