import { beforeEach, describe, expect, it, vi } from "vitest";

// La file « À compléter » (REA-333) : regroupement par copro, repli de l'immatriculation sur
// le référentiel, seuil au-delà duquel le conseil syndical n'est plus vérifié.

import type { Cycle } from "@/lib/domain/contrats-copro";

const etat = vi.hoisted(() => ({
  copros: [] as Record<string, unknown>[],
  contrats: new Map<string, Record<string, unknown>>(),
  cycles: [] as Cycle[],
  ascenseurs: [] as Record<string, unknown>[],
  csAvecEmail: new Set<string>(),
  appelsCs: [] as string[],
}));

vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () => ({ listerToutes: async () => etat.copros }),
  getContratsCoproRepository: () => ({
    listerContratsCourants: async (codes: string[]) => new Map([...etat.contrats].filter(([code]) => codes.includes(code))),
    listerCycles: async (f: { coproCodes?: string[] }) => etat.cycles.filter((c) => !f.coproCodes || f.coproCodes.includes(c.coproCode)),
    listerAscenseurs: async (codes: string[]) => etat.ascenseurs.filter((a) => codes.includes(a.coproCode as string)),
  }),
  getClesEntrepriseRepository: () => ({ lister: async () => [] }),
  getDepotDocumentProvider: () => ({ actif: false }),
  getAgenceRepository: () => ({ listerAgences: async () => [] }),
  getDelegationRepository: () => ({ listerPourBeneficiaire: async () => [] }),
  getGestionnaireRepository: () => ({ findById: async () => null, list: async () => [] }),
}));

vi.mock("@/lib/services/coproprietes/destinataires-conseil", () => ({
  destinatairesConseilSyndical: async (code: string) => {
    etat.appelsCs.push(code);
    return etat.csAvecEmail.has(code) ? { source: "estale", emails: ["cs@exemple.fr"] } : { source: "aucune", emails: [] };
  },
}));

import { SEUIL_VERIFICATION_CS, aCompleterPour } from "./a-completer";

const AUJOURDHUI = "2026-10-16";

const copro = (code: string, extra: Record<string, unknown> = {}) => ({
  code,
  nom: `Copro ${code}`,
  statut: "active",
  equipe: [{ initiales: "FD", nomComplet: "Fanny DUPONT", role: "gestionnaire" }],
  ...extra,
});

/** Un contrat COMPLET : assurance chez un partenaire, aucun équipement, immatriculée. */
const contratComplet = (code: string) => ({
  coproCode: code,
  assurance: { compagnie: "Axa", numeroContrat: "123", courtier: "GALIAN-SMABTP", souscriptionISO: "2020-01-01", echeanceISO: "2027-01-15", prime: 1000 },
  gaz: { fournisseur: null, typePrix: null, montant: null, echeanceISO: null },
  vmc: { societe: null, reference: null, dernierCtqISO: null },
  compteurs: { ascenseurs: 0, chaudieres: 0, vmcGaz: 0 },
  energieChauffage: "ELECTRICITE",
  immatriculation: { numero: "AA1", nonApplicable: null },
  devisRetenu: { ctq_ascenseur: null, ctq_vmc: null },
});

beforeEach(() => {
  etat.copros = [];
  etat.contrats = new Map();
  etat.cycles = [];
  etat.ascenseurs = [];
  etat.csAvecEmail = new Set();
  etat.appelsCs = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("aCompleterPour", () => {
  it("une copro avec 3 manques, une sans manque (absente), les plus incomplètes d'abord", async () => {
    etat.copros = [copro("S045"), copro("S104"), copro("S088", { immatriculation: "BB2" })];
    // S104 : deux compteurs jamais renseignés + pas d'immatriculation = 3 items.
    etat.contrats.set("S104", { ...contratComplet("S104"), compteurs: { ascenseurs: null, chaudieres: null, vmcGaz: 0 }, immatriculation: { numero: null, nonApplicable: null } });
    // S088 : immatriculation absente de la source mais connue du référentiel : rien à signaler.
    etat.contrats.set("S088", { ...contratComplet("S088"), immatriculation: { numero: null, nonApplicable: null } });
    // S045 : un seul manque (numéro de contrat), courtier « en direct » donc l'assurance compte.
    etat.contrats.set("S045", { ...contratComplet("S045"), assurance: { ...contratComplet("S045").assurance, courtier: "En direct", numeroContrat: null } });

    const groupes = await aCompleterPour({ aujourdhuiISO: AUJOURDHUI });
    expect(groupes.map((g) => g.coproCode)).toEqual(["S104", "S045"]);
    expect(groupes[0]).toMatchObject({ coproNom: "Copro S104", gestionnaire: "Fanny DUPONT" });
    expect(groupes[0].items.map((i) => `${i.rubrique}:${i.champ}`).sort()).toEqual(["compteur:ascenseurs", "compteur:chaudieres", "immatriculation:immatriculation"]);
    expect(groupes[1].items.map((i) => i.champ)).toEqual(["numeroContrat"]);
    // Sans demande explicite, le conseil syndical n'est pas interrogé.
    expect(etat.appelsCs).toEqual([]);
  });

  it("écarte les copros inactives, celles hors périmètre et celles sans ligne dans la source", async () => {
    etat.copros = [copro("S104"), copro("S088", { statut: "inactive" }), copro("S045"), copro("S019")];
    for (const code of ["S104", "S088", "S045"]) {
      etat.contrats.set(code, { ...contratComplet(code), immatriculation: { numero: null, nonApplicable: null } });
    }
    // S019 : aucune ligne dans la source -> passée.
    const groupes = await aCompleterPour({ coproCodes: ["S104", "S088", "S019"], aujourdhuiISO: AUJOURDHUI });
    expect(groupes.map((g) => g.coproCode)).toEqual(["S104"]);
    expect(await aCompleterPour({ coproCodes: [], aujourdhuiISO: AUJOURDHUI })).toEqual([]);
  });

  it("le cycle courant d'amorçage et l'appareil sans contrôle remontent", async () => {
    etat.copros = [copro("S104")];
    etat.contrats.set("S104", { ...contratComplet("S104"), compteurs: { ascenseurs: 1, chaudieres: 0, vmcGaz: 0 } });
    etat.ascenseurs = [{ id: "asc1", coproCode: "S104", identifiant: "ASC-1", dernierCtqISO: null }];
    const c: Cycle = { id: "c1", sujet: "ctq_ascenseur", coproCode: "S104", ascenseurId: "asc1", statut: "en_cours", echeanceISO: "1930-01-01", etapes: {}, demarreManuellement: null, creeLeISO: "2026-01-01" };
    etat.cycles = [c];
    const [g] = await aCompleterPour({ aujourdhuiISO: AUJOURDHUI });
    expect(g.items.map((i) => i.rubrique).sort()).toEqual(["appareil", "echeance_aberrante"]);
  });

  it("conseil syndical vérifié seulement sur demande et jusqu'à 60 copros", async () => {
    etat.copros = [copro("S104"), copro("S045")];
    etat.contrats.set("S104", contratComplet("S104"));
    etat.contrats.set("S045", contratComplet("S045"));
    etat.csAvecEmail.add("S045");

    let groupes = await aCompleterPour({ aujourdhuiISO: AUJOURDHUI, verifierConseilSyndical: true });
    expect(etat.appelsCs.sort()).toEqual(["S045", "S104"]);
    expect(groupes.map((g) => g.coproCode)).toEqual(["S104"]);
    expect(groupes[0].items.map((i) => i.rubrique)).toEqual(["conseil_syndical"]);

    // Au-delà du seuil : plus d'appel ESTALE, l'adresse est réputée connue.
    etat.appelsCs = [];
    etat.copros = Array.from({ length: SEUIL_VERIFICATION_CS + 1 }, (_, i) => copro(`S${String(i).padStart(3, "0")}`));
    for (const c of etat.copros) etat.contrats.set(c.code as string, contratComplet(c.code as string));
    groupes = await aCompleterPour({ aujourdhuiISO: AUJOURDHUI, verifierConseilSyndical: true });
    expect(etat.appelsCs).toEqual([]);
    expect(groupes).toEqual([]);
  });
});
