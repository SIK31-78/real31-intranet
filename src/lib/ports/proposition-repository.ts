// Ports du module Propositions (ADR-039). Ne dependent que du domaine.

import type { Proposition, StatutProposition } from "@/lib/domain/proposition/proposition";

export interface PropositionRepository {
  /** Toutes les propositions, les plus recemment modifiees d'abord. [] si la table manque. */
  lister(filtre?: { statuts?: StatutProposition[]; agence?: string }): Promise<Proposition[]>;
  get(id: string): Promise<Proposition | null>;
  creer(p: Omit<Proposition, "id" | "creeLeISO" | "majLeISO">): Promise<Proposition>;
  sauver(p: Proposition): Promise<void>;
}

/** Une copropriete telle que le registre national la connait. */
export interface RegistreCopro {
  immatriculation: string;
  nomUsage: string | null;
  adresse: string;
  codePostal: string;
  commune: string;
  lotsTotal: number | null;
  /** Habitation, bureaux, commerces = les lots principaux du contrat. */
  lotsPrincipaux: number | null;
  lotsStationnement: number | null;
  periodeConstruction: string | null;
  syndicNom: string | null;
  syndicType: string | null;
  mandat: string | null;
  finMandatISO: string | null;
}

export interface RegistreCoprosProvider {
  /** Recherche par adresse (mots libres), bornee. [] si le registre n'est pas charge. */
  rechercher(texte: string, limite?: number): Promise<RegistreCopro[]>;
  get(immatriculation: string): Promise<RegistreCopro | null>;
}
