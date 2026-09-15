// Mocks en memoire du module Propositions (mode COPRO_SOURCE absent).

import type {
  PropositionRepository,
  RegistreCopro,
  RegistreCoprosProvider,
} from "@/lib/ports/proposition-repository";
import type { Proposition, StatutProposition } from "@/lib/domain/proposition/proposition";

const PROPOSITIONS: Proposition[] = [];

export class MockPropositionRepository implements PropositionRepository {
  async lister(filtre?: { statuts?: StatutProposition[]; agence?: string }): Promise<Proposition[]> {
    return PROPOSITIONS.filter(
      (p) => (!filtre?.statuts || filtre.statuts.includes(p.statut)) && (!filtre?.agence || p.agence === filtre.agence),
    );
  }
  async get(id: string): Promise<Proposition | null> {
    return PROPOSITIONS.find((p) => p.id === id) ?? null;
  }
  async creer(p: Omit<Proposition, "id" | "creeLeISO" | "majLeISO">): Promise<Proposition> {
    const jour = new Date().toISOString().slice(0, 10);
    const cree = { ...p, id: `proposition-mock-${PROPOSITIONS.length + 1}`, creeLeISO: jour, majLeISO: jour };
    PROPOSITIONS.unshift(cree);
    return cree;
  }
  async sauver(p: Proposition): Promise<void> {
    const i = PROPOSITIONS.findIndex((x) => x.id === p.id);
    if (i >= 0) PROPOSITIONS[i] = { ...p, majLeISO: new Date().toISOString().slice(0, 10) };
  }
}

const REGISTRE: RegistreCopro[] = [
  {
    immatriculation: "AB1976653",
    nomUsage: "ORLEANS7",
    adresse: "7 r thomas d'orleans",
    codePostal: "92700",
    commune: "Colombes",
    lotsTotal: 46,
    lotsPrincipaux: 28,
    lotsStationnement: 18,
    periodeConstruction: null,
    syndicNom: "REAL 31",
    syndicType: "professionnel",
    mandat: "Mandat en cours",
    finMandatISO: "2025-12-31",
  },
];

export class MockRegistreCoprosProvider implements RegistreCoprosProvider {
  async rechercher(texte: string): Promise<RegistreCopro[]> {
    const t = texte.toLowerCase();
    return REGISTRE.filter((r) => `${r.adresse} ${r.commune}`.toLowerCase().includes(t.split(" ")[0] ?? ""));
  }
  async get(immatriculation: string): Promise<RegistreCopro | null> {
    return REGISTRE.find((r) => r.immatriculation === immatriculation) ?? null;
  }
}
