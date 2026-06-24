// Port du module Dossiers. Ne depend que du domaine.

import type {
  Dossier,
  EtapeDossier,
  EvenementDossier,
  PorteeDossier,
  TypeDossier,
} from "@/lib/domain/dossier";

export interface CreationDossier {
  coproCode: string;
  type: TypeDossier;
  portee: PorteeDossier;
  cible?: string;
  titre: string;
  origine?: string;
  etapes: EtapeDossier[];
  journal: EvenementDossier[];
  ouvertPar?: string;
}

export type PatchDossier = Partial<
  Pick<Dossier, "etapes" | "journal" | "statut" | "titre" | "cible">
> & {
  /** Rattachement AG (C5). null = effacer le rattachement. */
  agDate?: string | null;
  numeroResolution?: string | null;
};

export interface DossierRepository {
  /** Dossiers rattaches a un lot de copros (cloisonnement applique en amont). */
  listPourCopros(coproCodes: string[]): Promise<Dossier[]>;
  get(id: string): Promise<Dossier | null>;
  creer(input: CreationDossier): Promise<string>;
  patch(id: string, fields: PatchDossier): Promise<void>;
}
