// Adapter mock des mailings ESTALE (hors connexion ESTALE) : garde en mémoire les
// brouillons « créés », n'appelle rien. Sert au dev et aux tests du service.

import type { BrouillonMailing, MailingCree, MailingEstaleProvider } from "@/lib/ports/mailing-estale-provider";

export class MockMailingEstaleProvider implements MailingEstaleProvider {
  readonly brouillons: BrouillonMailing[] = [];

  async creerBrouillon(b: BrouillonMailing): Promise<MailingCree> {
    this.brouillons.push(b);
    const reference = String(this.brouillons.length).padStart(5, "0");
    return {
      mailingId: `mock-mailing-${reference}`,
      reference,
      titre: b.titre,
      destinatairesMail: 12,
      sansEmail: 2,
      coutEnvoi: 0,
      lien: "https://estale.app/",
    };
  }
}
