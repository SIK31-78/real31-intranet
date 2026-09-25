// Mock de l'annuaire ESTALE (dev sans identifiants ESTALE) : deux copropriétaires fictifs.

import type { CoproAnnuaire } from "@/lib/domain/linkus";
import type { AnnuaireEstaleProvider } from "@/lib/ports/annuaire-estale-provider";

export class MockAnnuaireEstaleProvider implements AnnuaireEstaleProvider {
  async listerCopros(): Promise<CoproAnnuaire[]> {
    return [
      {
        reference: "S0001",
        proprietaires: [
          {
            lastname: "Exemple", firstname: "Marie", companyName: null, isPro: false,
            phone: "+33102030405", mobile: "+33611223344",
            contacts: [{ lastname: "Locataire", firstname: "Paul", company: null, phone: "+33755667788", tenant: true }],
          },
        ],
      },
    ];
  }
}
