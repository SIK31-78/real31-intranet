import { describe, expect, it } from "vitest";
import { concerneSujet, estCourtierPartenaire, incoherencesCompteurs } from "./equipements";
import type { ContratCourant } from "./types";

const PARTENAIRES = ["Areas", "Dissoubray", "Galian-Smabtp", "Paris Tronchet"];

function contrat(over: Partial<ContratCourant> = {}): ContratCourant {
  return {
    coproCode: "S0247",
    assurance: { compagnie: "AXA", numeroContrat: "123", courtier: "Courtier Dupont", souscriptionISO: "2020-03-01", echeanceISO: "2027-03-01", prime: 4250 },
    gaz: { fournisseur: null, typePrix: null, montant: null, echeanceISO: null },
    vmc: { societe: null, reference: null, dernierCtqISO: null },
    compteurs: { ascenseurs: 0, chaudieres: 0, vmcGaz: 0 },
    energieChauffage: null,
    devisRetenu: { ctq_ascenseur: null, ctq_vmc: null },
    ...over,
  };
}

describe("estCourtierPartenaire", () => {
  it("égalité stricte sur le nom", () => {
    expect(estCourtierPartenaire("Areas", PARTENAIRES)).toBe(true);
    expect(estCourtierPartenaire("areas", PARTENAIRES)).toBe(false);
    expect(estCourtierPartenaire("Courtier Dupont", PARTENAIRES)).toBe(false);
    expect(estCourtierPartenaire(null, PARTENAIRES)).toBe(false);
    expect(estCourtierPartenaire("", PARTENAIRES)).toBe(false);
  });
});

describe("concerneSujet", () => {
  it("assurance : toujours, sauf chez un courtier partenaire", () => {
    expect(concerneSujet("assurance", { contrat: contrat(), nbAscenseurs: 0, partenaires: PARTENAIRES })).toBe(true);
    expect(concerneSujet("assurance", { contrat: contrat({ assurance: { ...contrat().assurance, courtier: null } }), nbAscenseurs: 0, partenaires: PARTENAIRES })).toBe(true);
    expect(concerneSujet("assurance", { contrat: contrat({ assurance: { ...contrat().assurance, courtier: "Areas" } }), nbAscenseurs: 0, partenaires: PARTENAIRES })).toBe(false);
  });

  it("gaz : des chaudières ET une énergie gaz (le fioul ne compte pas)", () => {
    const ctx = (chaudieres: number | null, energie: string | null) => ({ contrat: contrat({ compteurs: { ascenseurs: 0, chaudieres, vmcGaz: 0 }, energieChauffage: energie }), nbAscenseurs: 0, partenaires: PARTENAIRES });
    expect(concerneSujet("gaz", ctx(1, "GAZ"))).toBe(true);
    expect(concerneSujet("gaz", ctx(1, "FIOUL"))).toBe(false);
    expect(concerneSujet("gaz", ctx(0, "GAZ"))).toBe(false);
    expect(concerneSujet("gaz", ctx(null, "GAZ"))).toBe(false);
    expect(concerneSujet("gaz", ctx(2, null))).toBe(false);
  });

  it("CTQ ascenseur : compteur déclaré OU appareil créé", () => {
    expect(concerneSujet("ctq_ascenseur", { contrat: contrat({ compteurs: { ascenseurs: 2, chaudieres: 0, vmcGaz: 0 } }), nbAscenseurs: 0, partenaires: PARTENAIRES })).toBe(true);
    expect(concerneSujet("ctq_ascenseur", { contrat: contrat(), nbAscenseurs: 1, partenaires: PARTENAIRES })).toBe(true);
    expect(concerneSujet("ctq_ascenseur", { contrat: contrat({ compteurs: { ascenseurs: null, chaudieres: 0, vmcGaz: 0 } }), nbAscenseurs: 0, partenaires: PARTENAIRES })).toBe(false);
  });

  it("CTQ VMC : le compteur déclaré", () => {
    expect(concerneSujet("ctq_vmc", { contrat: contrat({ compteurs: { ascenseurs: 0, chaudieres: 0, vmcGaz: 1 } }), nbAscenseurs: 0, partenaires: PARTENAIRES })).toBe(true);
    expect(concerneSujet("ctq_vmc", { contrat: contrat(), nbAscenseurs: 0, partenaires: PARTENAIRES })).toBe(false);
  });
});

describe("incoherencesCompteurs", () => {
  it("déclarée sans ascenseur mais des appareils suivis", () => {
    const inc = incoherencesCompteurs({ contrat: contrat({ compteurs: { ascenseurs: null, chaudieres: 0, vmcGaz: 0 } }), nbAscenseurs: 2, nbCyclesVmc: 0 });
    expect(inc).toHaveLength(1);
    expect(inc[0]).toMatchObject({ champ: "ascenseurs", valeurSuggeree: 2 });
    expect(inc[0]?.message).toMatch(/sans ascenseur/);
    expect(inc[0]?.message).toMatch(/2 appareils sont suivis/);
  });

  it("ascenseurs déclarés mais aucun appareil créé (les 14 copros du plan)", () => {
    const inc = incoherencesCompteurs({ contrat: contrat({ compteurs: { ascenseurs: 1, chaudieres: 0, vmcGaz: 0 } }), nbAscenseurs: 0, nbCyclesVmc: 0 });
    expect(inc).toHaveLength(1);
    expect(inc[0]?.message).toMatch(/1 ascenseur déclaré mais aucun appareil/);
  });

  it("VMC suivie sans compteur ; rien quand tout concorde", () => {
    expect(incoherencesCompteurs({ contrat: contrat(), nbAscenseurs: 0, nbCyclesVmc: 1 })).toEqual([expect.objectContaining({ champ: "vmcGaz", valeurSuggeree: 1 })]);
    expect(incoherencesCompteurs({ contrat: contrat({ compteurs: { ascenseurs: 2, chaudieres: 1, vmcGaz: 1 } }), nbAscenseurs: 2, nbCyclesVmc: 1 })).toEqual([]);
    expect(incoherencesCompteurs({ contrat: contrat(), nbAscenseurs: 0, nbCyclesVmc: 0 })).toEqual([]);
  });
});
