// Adapter d'extraction MOCK du grand livre : implemente le port sans appeler d'IA. Sert a
// cabler et tester le service de reprise compta de bout en bout (sans reseau, mode demo).
// On peut l'instancier avec un jeu personnalise (tests) ; sinon il renvoie un petit grand
// livre FICTIF deterministe (classes 4/5/6/7) dont l'ENSEMBLE est EQUILIBRE (debit==credit).
//
// Donnees 100 % inventees (aucun nom / montant reel). Chaque operation est presentee comme
// une paire equilibree, comme dans une vraie compta en partie double :
//   - facture fournisseur : charge (6) au debit  / fournisseur (4) au credit ;
//   - appel de fonds       : coproprietaire (4) au debit / produit (7) au credit ;
//   - encaissement         : banque (5) au debit / coproprietaire (4) au credit ;
//   - paiement fournisseur : fournisseur (4) au debit / banque (5) au credit.
// Total debit == total credit -> le grand livre complet "tombe a 0" (auto-check fort valide).

import type { DocumentSource } from "@/lib/reprise/ports/document-source";
import type { ExtractionComptaProvider } from "@/lib/reprise/ports/extraction-compta-provider";
import type { JeuEcritures } from "@/lib/reprise/domain/ecriture";
import type { JeuRgd } from "@/lib/reprise/domain/rgd";
import { normaliserGrandLivre } from "@/lib/reprise/adapters/shared/normaliser-compta";

// On passe par le normaliseur (comme un vrai adapter) : dates ISO, montants positifs, classe
// deduite. Le brut est volontairement en JJ/MM/AAAA pour exercer la normalisation de date.
const GRAND_LIVRE_DEMO_BRUT = {
  lignes: [
    { date: "01/10/2025", compte: "6220000", libelle: "Facture entretien parties communes", sens: "debit", montant: 1200 },
    { date: "01/10/2025", compte: "4010000", libelle: "Facture entretien parties communes", sens: "credit", montant: 1200, piece: "FA-001" },
    { date: "05/10/2025", compte: "4500001", libelle: "Appel de fonds 1er trimestre", sens: "debit", montant: 2000 },
    { date: "05/10/2025", compte: "7010000", libelle: "Appel de fonds 1er trimestre", sens: "credit", montant: 2000 },
    { date: "10/10/2025", compte: "5120000", libelle: "Encaissement coproprietaire", sens: "debit", montant: 2000 },
    { date: "10/10/2025", compte: "4500001", libelle: "Encaissement coproprietaire", sens: "credit", montant: 2000 },
    { date: "15/10/2025", compte: "4010000", libelle: "Paiement fournisseur", sens: "debit", montant: 1200, piece: "FA-001" },
    { date: "15/10/2025", compte: "5120000", libelle: "Paiement fournisseur", sens: "credit", montant: 1200 },
  ],
  notes: ["Jeu de demonstration (mock) : grand livre fictif equilibre, classes 4/5/6/7 - aucune donnee reelle."],
};

const JEU_DEFAUT: JeuEcritures = normaliserGrandLivre(GRAND_LIVRE_DEMO_BRUT);

// RGD fictif assorti au grand livre de demonstration : la facture d'entretien de classe 6
// (6220000, 01/10/2025, 1 200) avec sa TVA - aucune donnee reelle.
const RGD_DEMO: JeuRgd = {
  lignes: [
    {
      date: "2025-10-01",
      compte: "6220000",
      libelle: "Facture entretien parties communes",
      ttc: 1200,
      tva: 200,
      recuperable: 0,
      deductible: 1200,
      cle: "001",
    },
  ],
  notes: ["Jeu de demonstration (mock) : RGD fictif apparie au grand livre de demo - aucune donnee reelle."],
  nonReconnues: 0,
};

export class MockComptaExtractionProvider implements ExtractionComptaProvider {
  constructor(
    private readonly jeu: JeuEcritures = JEU_DEFAUT,
    private readonly rgd: JeuRgd = RGD_DEMO,
  ) {}

  async extraireGrandLivre(_docs: DocumentSource[]): Promise<JeuEcritures> {
    void _docs;
    return this.jeu;
  }

  async extraireRgd(_docs: DocumentSource[]): Promise<JeuRgd> {
    void _docs;
    return this.rgd;
  }
}
