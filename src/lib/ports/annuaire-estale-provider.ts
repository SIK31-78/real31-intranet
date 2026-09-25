// Port : les copropriétaires ESTALE et leurs contacts, avec téléphones, de toutes les
// copros accessibles. Sert l'export de l'annuaire Linkus (/admin/linkus). Lecture seule.

import type { CoproAnnuaire } from "@/lib/domain/linkus";

export interface AnnuaireEstaleProvider {
  listerCopros(): Promise<CoproAnnuaire[]>;
}
