// Adapter d'extraction MOCK : implemente le port sans appeler d'IA. Sert a cabler et
// tester l'orchestrateur de bout en bout avant de brancher Mistral (EU) / Claude.
// On peut l'instancier avec des resultats personnalises (tests) ; sinon il renvoie une
// petite copro canonique deterministe.

import type {
  DocumentSource,
  ExtractionProvider,
  ResultatPatrimoine,
  ResultatProprietaires,
} from "@/lib/reprise/ports/extraction-provider";

const PATRIMOINE_DEFAUT: ResultatPatrimoine = {
  lots: [
    { numero: 1, type: "Appartement", usage: "residential", etage: 0, surface: 52, nbPiece: 3, commentaire: "T3 RDC" },
    { numero: 2, type: "Appartement", usage: "residential", etage: 1, surface: 48, nbPiece: 2, commentaire: "T2 1er" },
    { numero: 3, type: "Parking", usage: "parking", etage: -1, commentaire: "Parking sous-sol" },
  ],
  cles: [{ code: "001", libelle: "Charges générales", totalAttendu: 1000, defaut: true }],
  tantiemes: [
    { cleCode: "001", lot: 1, valeur: 450 },
    { cleCode: "001", lot: 2, valeur: 400 },
    { cleCode: "001", lot: 3, valeur: 150 },
  ],
  notes: ["EDD retenu : rcp.pdf (total tantiemes coherent avec la capture eStale)"],
};

const PROPRIETAIRES_DEFAUT: ResultatProprietaires = {
  owners: [
    { id: "o1", civilite: "m&mme", nom: "DUPONT", prenom: "Jean & Marie", pro: false },
    { id: "o2", civilite: "mme", nom: "MARTIN", prenom: "Claire", pro: false },
    { id: "o3", civilite: "m", nom: "SCI BELLEVUE", pro: true, formeJuridique: "SCI", raisonSociale: "SCI BELLEVUE" },
  ],
  attributions: [
    { ownerId: "o1", lot: 1 },
    { ownerId: "o2", lot: 2 },
    { ownerId: "o3", lot: 3 },
  ],
  notes: ["SCI BELLEVUE : gerant inconnu -> civilite m par defaut ; K-bis a fournir"],
};

export class MockExtractionProvider implements ExtractionProvider {
  constructor(
    private readonly patrimoine: ResultatPatrimoine = PATRIMOINE_DEFAUT,
    private readonly proprietaires: ResultatProprietaires = PROPRIETAIRES_DEFAUT,
  ) {}

  async extrairePatrimoine(_docs: DocumentSource[]): Promise<ResultatPatrimoine> {
    void _docs;
    return this.patrimoine;
  }

  async extraireProprietaires(_docs: DocumentSource[]): Promise<ResultatProprietaires> {
    void _docs;
    return this.proprietaires;
  }
}
