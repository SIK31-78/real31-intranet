// Port : les copropriétaires ACTIFS d'une copro ESTALE joignables par e-mail, pour le mail
// « toute la copropriété » du compositeur (REA-356, 19/10/2026). Pour une copro présente
// dans ESTALE, c'est la liste qui fait foi : l'annuaire Crypto y garde d'anciens
// copropriétaires (S178 : 80 adresses pour 42 propriétaires). LECTURE SEULE.
// Ne dépend que du domaine.

import type { CoproprietaireJoignable } from "@/lib/domain/mes-emails-composition";

export type { CoproprietaireJoignable };

export interface CoproprietairesEstaleProvider {
  /**
   * Copropriétaires non archivés qui acceptent le mail (canReceiveMail) et ont une adresse.
   * null = la copro n'est pas dans ESTALE : l'appelant garde l'annuaire Crypto.
   */
  listerJoignables(reference: string): Promise<CoproprietaireJoignable[] | null>;
}
