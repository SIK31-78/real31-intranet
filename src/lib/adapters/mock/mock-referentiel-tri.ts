// Referentiel FICTIF du tri des e-mails (ESTALE non configure) : quelques copros et
// adresses inventees, pour faire tourner l'ecran sans ESTALE. Aucune donnee reelle.

import type { ReferentielTri } from "@/lib/domain/tri-emails";
import type { ReferentielTriProvider } from "@/lib/ports/referentiel-tri-provider";

const gestionnaire = (nomComplet: string, email: string) => ({ nomComplet, email });

const REFERENTIEL: ReferentielTri = {
  copros: [
    { reference: "S0297", nom: "La Pléiade", adresse: "4 allée des Astres 31000 Toulouse", gestionnaire: gestionnaire("Sophie Kergal", "sophie.kergal@exemple.fr"), assistant: { nomComplet: "Clara Petit", email: "clara.petit@exemple.fr" } },
    { reference: "S0305", nom: "4 Gaultier", adresse: "4 rue Gaultier 31770 Colomiers", gestionnaire: gestionnaire("Sophie Kergal", "sophie.kergal@exemple.fr"), assistant: null },
    { reference: "S0306", nom: "Le Tournois", adresse: "24 avenue Franklin 31000 Toulouse", gestionnaire: gestionnaire("David Morin", "david.morin@exemple.fr"), assistant: null },
    { reference: "SE999", nom: "Copropriété de test", adresse: "", gestionnaire: gestionnaire("David Morin", "david.morin@exemple.fr"), assistant: null },
  ],
  expediteurs: {
    "m.delmas@exemple.fr": [{ reference: "S0297", qualite: "copropriétaire" }],
    "devis@plomberie-exemple.fr": [
      { reference: "S0297", qualite: "fournisseur" },
      { reference: "S0306", qualite: "fournisseur" },
    ],
  },
};

export class MockReferentielTri implements ReferentielTriProvider {
  async charger(): Promise<ReferentielTri> {
    return REFERENTIEL;
  }
}
