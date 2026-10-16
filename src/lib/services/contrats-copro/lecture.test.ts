import { beforeEach, describe, expect, it, vi } from "vitest";

// Services de lecture « Contrats & contrôles » (REA-333) : composition de la fiche, liste
// consolidée, compteurs, bloc de l'accueil. Routeur doublé, données en mémoire.

import type { Cycle, DevisCtq, DocumentContrat, OffreAssurance, OffreGaz, RegleRelance, SujetSuivi } from "@/lib/domain/contrats-copro";
import { REGLES_RELANCE_DEFAUT } from "@/lib/domain/contrats-copro";

const etat = vi.hoisted(() => ({
  copros: [] as Record<string, unknown>[],
  coprosKo: false,
  cycles: [] as Cycle[],
  offresAssurance: [] as Record<string, unknown>[],
  offresGaz: [] as Record<string, unknown>[],
  devis: [] as Record<string, unknown>[],
  documents: [] as Record<string, unknown>[],
  journalKo: false,
  entreprises: [] as Record<string, unknown>[],
  entreprisesKo: false,
  contrats: new Map<string, Record<string, unknown>>(),
  appels: { offresAssurance: 0, offresGaz: 0, devis: 0, agences: 0 },
}));

vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () => ({
    findByCode: async (code: string) => etat.copros.find((c) => c.code === code) ?? null,
    listerToutes: async () => etat.copros,
    list: async (managerId?: string) => {
      if (etat.coprosKo) throw new Error("référentiel indisponible");
      return etat.copros.filter((c) => !managerId || c.managerId === managerId);
    },
  }),
  getContratsCoproRepository: () => ({
    getContratCourant: async (code: string) => etat.contrats.get(code) ?? null,
    listerCycles: async (f: { coproCodes?: string[]; statuts?: string[] }) =>
      etat.cycles.filter((c) => (!f.coproCodes || f.coproCodes.includes(c.coproCode)) && (!f.statuts || f.statuts.includes(c.statut))),
    listerAscenseurs: async () => [],
    listerDevisCtq: async (codes: string[]) => {
      etat.appels.devis += 1;
      return etat.devis.filter((d) => codes.includes(d.coproCode as string));
    },
    listerDocuments: async () => etat.documents,
    listerPrestataires: async () => [],
    listerJournal: async () => {
      if (etat.journalKo) throw new Error("relation intranet_contrats_journal does not exist");
      return [{ id: "j1", type: "suivi_demarre" }];
    },
    listerReglesRelance: async () => REGLES_RELANCE_DEFAUT,
    listerOffresAssurance: async (ids: string[]) => {
      etat.appels.offresAssurance += 1;
      return etat.offresAssurance.filter((o) => ids.includes(o.cycleId as string));
    },
    listerOffresGaz: async (ids: string[]) => {
      etat.appels.offresGaz += 1;
      return etat.offresGaz.filter((o) => ids.includes(o.cycleId as string));
    },
  }),
  getClesEntrepriseRepository: () => ({
    lister: async () => {
      if (etat.entreprisesKo) throw new Error("colonne absente");
      return etat.entreprises;
    },
  }),
  getDepotDocumentProvider: () => ({ actif: false }),
  getAgenceRepository: () => ({
    listerAgences: async () => {
      etat.appels.agences += 1;
      return [{ id: "ag-ml", code: "ML" }];
    },
  }),
  getDelegationRepository: () => ({ listerPourBeneficiaire: async () => [] }),
  getGestionnaireRepository: () => ({ findById: async () => null, list: async () => [] }),
}));

import { compteursSuivis, courtiersPartenaires, cycleVue, echeancesPourAccueil, estChezCourtierPartenaire, listerSuivis, suiviDeCopro } from "./lecture";
import type { LigneSuivi } from "./types";

const AUJOURDHUI = "2026-10-16";

const copro = (code: string, extra: Record<string, unknown> = {}) => ({
  code,
  nom: `Copro ${code}`,
  statut: "active",
  agenceId: "ag-ml",
  managerId: "g1",
  equipe: [{ initiales: "FD", nomComplet: "Fanny DUPONT", role: "gestionnaire" }],
  ...extra,
});

const contrat = (code: string, extra: Partial<Record<string, unknown>> = {}) => ({
  coproCode: code,
  assurance: { compagnie: "Axa", numeroContrat: "123", courtier: "AREAS", souscriptionISO: "2020-01-01", echeanceISO: "2027-01-15", prime: 1000 },
  gaz: { fournisseur: null, typePrix: null, montant: null, echeanceISO: null },
  vmc: { societe: null, reference: null, dernierCtqISO: null },
  compteurs: { ascenseurs: 0, chaudieres: 2, vmcGaz: 0 },
  energieChauffage: "GAZ",
  immatriculation: { numero: "AA1", nonApplicable: null },
  devisRetenu: { ctq_ascenseur: null, ctq_vmc: null },
  ...extra,
});

const cycle = (id: string, sujet: SujetSuivi, coproCode: string, extra: Partial<Cycle> = {}): Cycle => ({
  id,
  sujet,
  coproCode,
  statut: "en_cours",
  echeanceISO: "2027-01-15",
  etapes: {},
  demarreManuellement: null,
  creeLeISO: "2026-03-01",
  ...extra,
});

beforeEach(() => {
  etat.copros = [];
  etat.coprosKo = false;
  etat.cycles = [];
  etat.offresAssurance = [];
  etat.offresGaz = [];
  etat.devis = [];
  etat.documents = [];
  etat.journalKo = false;
  etat.entreprises = [];
  etat.entreprisesKo = false;
  etat.contrats = new Map();
  etat.appels = { offresAssurance: 0, offresGaz: 0, devis: 0, agences: 0 };
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("courtiersPartenaires", () => {
  it("référentiel UNION repli, dédoublonnés par nom normalisé", async () => {
    etat.entreprises = [
      { nom: "AREAS", courtierPartenaire: true },
      { nom: "Courtage Dupuis", courtierPartenaire: true },
      { nom: "Otis", courtierPartenaire: false },
    ];
    const liste = await courtiersPartenaires();
    expect(liste).toContain("Courtage Dupuis");
    expect(liste).toContain("Paris Tronchet");
    expect(liste).not.toContain("Otis");
    expect(liste.filter((n) => n.toLowerCase() === "areas")).toHaveLength(1);
  });

  it("référentiel illisible -> la liste de repli", async () => {
    etat.entreprisesKo = true;
    expect(await courtiersPartenaires()).toEqual(["Areas", "Assurances Dissoubray", "Galian-Smabtp", "Paris Tronchet"]);
  });

  it("estChezCourtierPartenaire normalise des deux côtés", () => {
    const partenaires = ["Areas", "Assurances Dissoubray"];
    expect(estChezCourtierPartenaire("AREAS", partenaires)).toBe(true);
    expect(estChezCourtierPartenaire("  assurances  dissoubray ", partenaires)).toBe(true);
    expect(estChezCourtierPartenaire("Dissoubray", partenaires)).toBe(false);
    expect(estChezCourtierPartenaire(null, partenaires)).toBe(false);
    expect(estChezCourtierPartenaire("", partenaires)).toBe(false);
  });
});

describe("cycleVue", () => {
  const regle: RegleRelance = REGLES_RELANCE_DEFAUT.assurance;

  it("fenêtre ouverte depuis 89 jours sans étape -> rouge ; une étape récente -> vert", () => {
    const fige = cycleVue(cycle("a", "assurance", "S1", { demarreManuellement: true }), regle, AUJOURDHUI, false);
    expect(fige.niveau).toBe("rouge");
    expect(fige.joursSansAvancement).toBe(89);
    expect(fige.aDemarrer).toBe(false);
    const vif = cycleVue(cycle("b", "assurance", "S1", { etapes: { sinistralite_demandee: "2026-10-01" } }), regle, AUJOURDHUI, false);
    expect(vif.niveau).toBe("vert");
    expect(vif.progression).toMatchObject({ franchies: 1, total: 6 });
    expect(vif.progression.etapeCourante?.cle).toBe("sinistralite_demandee");
  });

  it("amorçage sans activité -> à démarrer ; avec activité -> non", () => {
    expect(cycleVue(cycle("a", "gaz", "S1"), REGLES_RELANCE_DEFAUT.gaz, AUJOURDHUI, false).aDemarrer).toBe(true);
    expect(cycleVue(cycle("a", "gaz", "S1"), REGLES_RELANCE_DEFAUT.gaz, AUJOURDHUI, true).aDemarrer).toBe(false);
  });
});

describe("suiviDeCopro", () => {
  it("copro inconnue -> null", async () => {
    expect(await suiviDeCopro("S000", "g1", AUJOURDHUI)).toBeNull();
  });

  it("compose la fiche : courtier partenaire normalisé, concerne, tri des cycles, niveau global", async () => {
    etat.copros = [copro("S104")];
    etat.contrats.set("S104", contrat("S104"));
    etat.entreprises = [{ nom: "Areas", courtierPartenaire: true }];
    etat.cycles = [
      cycle("a0", "assurance", "S104", { statut: "clos", creeLeISO: "2025-01-01", etapes: { validee: "2026-01-10" } }),
      cycle("a1", "assurance", "S104", { creeLeISO: "2026-03-01", etapes: { sinistralite_demandee: "2026-10-01" } }),
      cycle("a2", "assurance", "S104", { statut: "archive", creeLeISO: "2026-06-01" }),
      cycle("g1", "gaz", "S104", { echeanceISO: null, creeLeISO: "2026-02-01" }),
    ];
    etat.offresGaz = [{ id: "og1", cycleId: "g1", fournisseur: "Engie", typePrix: "fixe", montant: 1200, dureeMois: 24, recueLeISO: null } satisfies OffreGaz];
    etat.documents = [
      { id: "d1", sujet: "assurance", typeDocument: "offre", rattachement: { type: "cycle_assurance", cycleId: "a1" } },
      { id: "d2", sujet: "gaz", typeDocument: "offre", rattachement: { type: "offre_gaz", offreId: "og1" } },
    ];

    const s = await suiviDeCopro("S104", "g1", AUJOURDHUI);
    expect(s).not.toBeNull();
    // « AREAS » (source) reconnu comme « Areas » (référentiel) : partenaire, donc pas concernée.
    expect(s!.assurance.courtierPartenaire).toBe(true);
    expect(s!.assurance.concerne).toBe(false);
    // 2 chaudières au GAZ : concernée par le gaz ; ni ascenseur ni VMC.
    expect(s!.gaz.concerne).toBe(true);
    expect(s!.ctqAscenseur.concerne).toBe(false);
    expect(s!.ctqVmc.concerne).toBe(false);
    // En cours d'abord, puis du plus récent au plus ancien.
    expect(s!.assurance.cycles.map((v) => v.cycle.id)).toEqual(["a1", "a2", "a0"]);
    expect(s!.assurance.cycles[0].niveau).toBe("vert");
    expect(s!.assurance.documents.map((d) => d.id)).toEqual(["d1"]);
    expect(s!.gaz.documents.map((d) => d.id)).toEqual(["d2"]);
    // Le cycle gaz sans échéance est « à compléter » mais il a une offre : pas replié.
    expect(s!.gaz.cycles[0].niveau).toBe("a_completer");
    expect(s!.gaz.cycles[0].aDemarrer).toBe(false);
    expect(s!.gaz.offres).toHaveLength(1);
    // Pire niveau des cycles en cours : vert (a_completer se compte à part).
    expect(s!.niveauGlobal).toBe("vert");
    expect(s!.journal).toHaveLength(1);
    expect(s!.peutEcrire).toBe(true);
    expect(s!.depotActif).toBe(false);
    expect(s!.regles.assurance.premierRappelJours).toBe(180);
  });

  it("dossier figé -> rouge ; seulement des cycles sans échéance -> a_completer ; aucun -> null", async () => {
    etat.copros = [copro("S104")];
    etat.contrats.set("S104", contrat("S104", { assurance: { ...contrat("S104").assurance, courtier: "En direct" } }));
    etat.cycles = [cycle("a1", "assurance", "S104", { demarreManuellement: true })];
    let s = await suiviDeCopro("S104", "g1", AUJOURDHUI);
    expect(s!.assurance.concerne).toBe(true);
    expect(s!.assurance.courtierPartenaire).toBe(false);
    expect(s!.niveauGlobal).toBe("rouge");

    etat.cycles = [cycle("g1", "gaz", "S104", { echeanceISO: null })];
    s = await suiviDeCopro("S104", "g1", AUJOURDHUI);
    expect(s!.niveauGlobal).toBe("a_completer");

    etat.cycles = [];
    s = await suiviDeCopro("S104", "g1", AUJOURDHUI);
    expect(s!.niveauGlobal).toBeNull();
  });

  it("journal absent (SQL pas passé) -> fiche rendue, journal vide, un warn", async () => {
    etat.copros = [copro("S104")];
    etat.contrats.set("S104", contrat("S104"));
    etat.journalKo = true;
    const s = await suiviDeCopro("S104", "g1", AUJOURDHUI);
    expect(s).not.toBeNull();
    expect(s!.journal).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("journal"), expect.any(String));
  });

  it("copro sans ligne dans la source -> contrat courant vide, fiche rendue quand même", async () => {
    etat.copros = [copro("S104")];
    const s = await suiviDeCopro("S104", "g1", AUJOURDHUI);
    expect(s!.contrat.compteurs).toEqual({ ascenseurs: null, chaudieres: null, vmcGaz: null });
    expect(s!.assurance.concerne).toBe(true);
    expect(s!.gaz.concerne).toBe(false);
  });
});

describe("listerSuivis", () => {
  it("écarte les copros inactives ou inconnues, enrichit et trie (échéance croissante, nulles en dernier)", async () => {
    etat.copros = [copro("S104"), copro("S088", { statut: "inactive" })];
    etat.cycles = [
      cycle("c-null", "gaz", "S104", { echeanceISO: null }),
      cycle("c-tard", "assurance", "S104", { echeanceISO: "2027-06-01" }),
      cycle("c-tot", "ctq_vmc", "S104", { echeanceISO: "2026-12-01", demarreManuellement: true }),
      cycle("c-inactive", "assurance", "S088"),
      cycle("c-inconnue", "assurance", "S999"),
      cycle("c-clos", "assurance", "S104", { statut: "clos", echeanceISO: "2026-01-01" }),
    ];
    etat.devis = [{ id: "dv1", coproCode: "S104", sujet: "ctq_vmc", prestataire: "Veritas", montant: 500, recueLeISO: null } satisfies DevisCtq];

    const lignes = await listerSuivis({ aujourdhuiISO: AUJOURDHUI });
    expect(lignes.map((l) => l.cycleId)).toEqual(["c-tot", "c-tard", "c-null"]);
    expect(lignes[0]).toMatchObject({ coproNom: "Copro S104", agenceCode: "ML", gestionnaire: "Fanny DUPONT", managerId: "g1", sujet: "ctq_vmc", statut: "en_cours" });
    // Fenêtre VMC à 120 jours ouverte le 03/08, aucune étape : 74 jours -> rouge.
    expect(lignes[0].niveau).toBe("rouge");
    expect(lignes[0].joursSansAvancement).toBe(74);
    // Amorçage : la ligne assurance (fenêtre pas ouverte) est verte et « à démarrer » ; la
    // ligne gaz sans échéance est « à compléter ».
    expect(lignes[1]).toMatchObject({ niveau: "vert", aDemarrer: true, etapeCourante: null, franchies: 0, total: 6 });
    expect(lignes[2]).toMatchObject({ niveau: "a_completer", aDemarrer: true });
    // Lectures groupées : une par famille, pas une par cycle.
    expect(etat.appels).toMatchObject({ offresAssurance: 1, offresGaz: 1, devis: 1, agences: 1 });
  });

  it("restreint aux copros données ; périmètre vide -> rien", async () => {
    etat.copros = [copro("S104"), copro("S045")];
    etat.cycles = [cycle("a", "assurance", "S104"), cycle("b", "assurance", "S045")];
    expect((await listerSuivis({ coproCodes: ["S045"], aujourdhuiISO: AUJOURDHUI })).map((l) => l.coproCode)).toEqual(["S045"]);
    expect(await listerSuivis({ coproCodes: [], aujourdhuiISO: AUJOURDHUI })).toEqual([]);
  });

  it("une offre sur un cycle d'amorçage le sort du repli", async () => {
    etat.copros = [copro("S104")];
    etat.cycles = [cycle("a", "assurance", "S104", { echeanceISO: "2027-06-01" })];
    etat.offresAssurance = [{ id: "oa1", cycleId: "a", assureur: "Axa", prime: 900, franchise: 100, garanties: null, recueLeISO: null } satisfies OffreAssurance];
    const [l] = await listerSuivis({ aujourdhuiISO: AUJOURDHUI });
    expect(l.aDemarrer).toBe(false);
  });
});

describe("compteursSuivis", () => {
  it("compte par niveau et par sujet", () => {
    const ligne = (niveau: LigneSuivi["niveau"], sujet: SujetSuivi): LigneSuivi => ({
      cycleId: "x",
      sujet,
      coproCode: "S1",
      coproNom: "S1",
      echeanceISO: null,
      niveau,
      statut: "en_cours",
      etapeCourante: null,
      franchies: 0,
      total: 1,
      aDemarrer: false,
      joursSansAvancement: null,
    });
    const c = compteursSuivis([ligne("rouge", "assurance"), ligne("rouge", "gaz"), ligne("orange", "gaz"), ligne("vert", "ctq_vmc"), ligne("a_completer", "ctq_ascenseur")]);
    expect(c).toEqual({ total: 5, rouge: 2, orange: 1, vert: 1, aCompleter: 1, parSujet: { assurance: 1, gaz: 2, ctq_ascenseur: 1, ctq_vmc: 1 } });
    expect(compteursSuivis([])).toMatchObject({ total: 0, parSujet: { assurance: 0, gaz: 0, ctq_ascenseur: 0, ctq_vmc: 0 } });
  });
});

describe("echeancesPourAccueil", () => {
  it("rouges et oranges sur mes copros, sans les amorçages repliés ; à compléter compté", async () => {
    etat.copros = [copro("S104"), copro("S045", { managerId: "g2" })];
    etat.cycles = [
      cycle("fige", "assurance", "S104", { demarreManuellement: true }),
      cycle("replie", "gaz", "S104", { echeanceISO: "2026-12-01" }),
      cycle("vide", "ctq_vmc", "S104", { echeanceISO: null }),
      cycle("autre", "assurance", "S045", { demarreManuellement: true }),
    ];
    const e = await echeancesPourAccueil("g1", AUJOURDHUI);
    expect(e.rouges.map((l) => l.cycleId)).toEqual(["fige"]);
    expect(e.oranges).toEqual([]);
    expect(e.aCompleter).toBe(1);
  });

  it("référentiel en panne -> vide, un warn, jamais une exception", async () => {
    etat.coprosKo = true;
    await expect(echeancesPourAccueil("g1", AUJOURDHUI)).resolves.toEqual({ rouges: [], oranges: [], aCompleter: 0 });
    expect(console.warn).toHaveBeenCalled();
  });

  it("aucune copro dans la vue -> vide sans lire les cycles", async () => {
    expect(await echeancesPourAccueil("g1", AUJOURDHUI)).toEqual({ rouges: [], oranges: [], aCompleter: 0 });
  });
});

// Le type DocumentContrat n'est pas construit en entier dans les jeux ci-dessus : seul le
// rattachement et le sujet comptent pour la lecture. On le dit au compilateur une fois.
void (null as unknown as DocumentContrat);
