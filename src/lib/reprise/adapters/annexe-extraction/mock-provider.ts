// Adapter MOCK du port ExtractionAnnexeProvider : implemente le contrat sans appeler d'IA. Sert
// a cabler et tester le pipeline annexes de bout en bout (sans reseau, mode demonstration).
//
// On peut l'instancier avec un resultat personnalise (tests) ; sinon il renvoie un resultat
// FICTIF deterministe (aucune donnee reelle) qui exerce les trois statuts de rapprochement.

import type { DocumentSource } from "@/lib/reprise/ports/document-source";
import type { AnnexeExtraite, ExtractionAnnexeProvider } from "@/lib/reprise/ports/extraction-annexe-provider";

const ANNEXE_DEMO: AnnexeExtraite = {
  typeDetecte: "liste coproprietaires",
  contacts: [
    { nom: "DUPONT Jean", email: "jean.dupont@example.test", telephone: "0600000000" },
    { nom: "MARTIN Sophie", email: "sophie.martin@example.test" },
  ],
  pointsAttention: [
    "Un coproprietaire signale un contentieux en cours sur le lot 12 (mock, aucune donnee reelle).",
  ],
  resume: "Liste de coproprietaires fictive (mock) avec quelques emails - aucune donnee reelle.",
};

export class MockAnnexeExtractionProvider implements ExtractionAnnexeProvider {
  constructor(private readonly resultat: AnnexeExtraite = ANNEXE_DEMO) {}

  async extraireAnnexe(_doc: DocumentSource): Promise<AnnexeExtraite> {
    void _doc;
    return this.resultat;
  }
}
