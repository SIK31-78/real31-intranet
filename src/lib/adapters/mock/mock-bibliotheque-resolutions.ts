// Adapter mock de la bibliotheque de resolutions (hors mode supabase/eStale).
// Quelques resolutions representatives pour que la vue ait du contenu en dev.

import type { BibliothequeResolutionsProvider } from "@/lib/ports/bibliotheque-resolutions";
import type { Resolution } from "@/lib/domain/resolution";

const RESOLUTIONS: Resolution[] = [
  {
    id: "mock-1",
    titre: "Constitution du bureau",
    corps: "L'assemblée générale désigne le président de séance, le secrétaire et le ou les scrutateurs.",
    majorite: "QUESTION",
    motsCles: ["bureau", "séance"],
    parDefaut: true,
    rank: "1",
    estGroupe: true,
  },
  {
    id: "mock-1-1",
    titre: "Désignation du Président de séance",
    corps: "L'assemblée désigne le président de séance.",
    majorite: "A24",
    motsCles: ["bureau"],
    parDefaut: true,
    rank: "1.1",
  },
  {
    id: "mock-2",
    titre: "Examen et approbation des comptes de l'exercice N-1",
    corps: "L'assemblée générale approuve les comptes de l'exercice clos tels que présentés par le syndic.",
    majorite: "A24",
    motsCles: ["comptes", "approbation"],
    parDefaut: true,
    rank: "2",
  },
  {
    id: "mock-3",
    titre: "Vote du budget prévisionnel pour l'exercice N+1",
    corps: "L'assemblée générale vote le budget prévisionnel des charges courantes pour l'exercice à venir.",
    majorite: "A24",
    motsCles: ["budget"],
    parDefaut: true,
    rank: "3",
  },
  {
    id: "mock-4",
    titre: "Reconduction du Syndic",
    corps: "L'assemblée générale décide de reconduire le syndic dans ses fonctions aux conditions du contrat.",
    majorite: "A25_1",
    motsCles: ["syndic", "contrat"],
    parDefaut: true,
    rank: "4",
  },
  {
    id: "mock-5",
    titre: "Vote de travaux d'amélioration",
    corps: "L'assemblée générale décide la réalisation des travaux sur la base du devis de l'entreprise retenue.",
    majorite: "A25",
    motsCles: ["travaux", "devis"],
    parDefaut: false,
    rank: "5",
  },
  {
    id: "mock-6",
    titre: "Questions diverses",
    corps: "Points d'information n'appelant pas de vote.",
    majorite: "QUESTION",
    motsCles: ["divers"],
    parDefaut: true,
    rank: "6",
  },
];

export class MockBibliothequeResolutions implements BibliothequeResolutionsProvider {
  async listerCabinet(): Promise<Resolution[]> {
    return RESOLUTIONS;
  }
}
