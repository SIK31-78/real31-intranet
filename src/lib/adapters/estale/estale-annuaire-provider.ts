// Adapter ESTALE de l'annuaire Linkus : pour chaque copro accessible au compte de
// service, ses copropriétaires (non archivés) avec fixe, mobile et contacts. LECTURE SEULE.
// Une requête par copro, 4 à la fois : l'API tolère 50 req/s et coupe à 30 s, une
// méga-requête sur tout le cabinet tomberait sur la limite de temps.

import type { CoproAnnuaire, ProprietaireAnnuaire } from "@/lib/domain/linkus";
import type { AnnuaireEstaleProvider } from "@/lib/ports/annuaire-estale-provider";
import { estaleGql } from "./client";
import { chargerCondosAccessibles } from "./condos-accessibles";

const Q_PROPRIETAIRES = `query($id: ID!) {
  condo(id: $id) {
    owners(archived: false) {
      lastname firstname companyName isPro phone mobile
      contacts(archived: false) { lastname firstname company phone tenant }
    }
  }
}`;

type Data = { condo: { owners: ProprietaireAnnuaire[] } | null };

const EN_PARALLELE = 4;

export class EstaleAnnuaireProvider implements AnnuaireEstaleProvider {
  async listerCopros(): Promise<CoproAnnuaire[]> {
    const condos = await chargerCondosAccessibles();
    const resultats: CoproAnnuaire[] = [];
    for (let i = 0; i < condos.length; i += EN_PARALLELE) {
      const lot = condos.slice(i, i + EN_PARALLELE);
      const donnees = await Promise.all(lot.map((c) => estaleGql<Data>(Q_PROPRIETAIRES, { id: c.id })));
      lot.forEach((c, j) => resultats.push({ reference: c.reference, proprietaires: donnees[j]!.condo?.owners ?? [] }));
    }
    return resultats;
  }
}
