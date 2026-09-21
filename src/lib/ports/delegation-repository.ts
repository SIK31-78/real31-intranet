// Port : les delegations d'ecriture (ADR-041). Table intranet_delegation ; absente = aucune
// delegation, jamais une erreur.

import type { Delegation, PorteeDelegation } from "@/lib/domain/perimetre-ecriture";

export interface DelegationEnregistree extends Delegation {
  creePar: string;
  createdAtISO: string;
  /** Retiree avant terme (cloturee), ISO. */
  clotureeLeISO?: string | null;
}

export interface NouvelleDelegation {
  deUserId: string;
  aUserId: string;
  portee: PorteeDelegation;
  agenceCode?: string | null;
  coproCode?: string | null;
  depuisISO: string;
  jusquaISO?: string | null;
  motif?: string | null;
  creePar: string;
}

export interface DelegationRepository {
  /** Les delegations NON cloturees dont `userId` est le beneficiaire (actives ou a venir). */
  listerPourBeneficiaire(userId: string): Promise<DelegationEnregistree[]>;
  /** Toutes les delegations non cloturees, pour l'ecran Collaborateurs. */
  listerEnCours(): Promise<DelegationEnregistree[]>;
  creer(d: NouvelleDelegation): Promise<string>;
  /** Retire une delegation avant son terme. */
  cloturer(id: string, par: string): Promise<void>;
}
