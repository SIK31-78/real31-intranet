import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Batiment, ContratCourant, FicheImmeuble, NouvelleEntreeJournal, PatchFicheImmeuble } from "@/lib/domain/contrats-copro";

// Le service de la fiche immeuble : périmètre d'écriture, cascades serveur, journal, et la
// file des copros à compléter. Le routeur, le journal et le périmètre sont des doublures.

const etat = vi.hoisted(() => ({
  fiches: new Map<string, FicheImmeuble>(),
  contrats: new Map<string, ContratCourant>(),
  patches: [] as { coproCode: string; patch: PatchFicheImmeuble }[],
  journal: [] as NouvelleEntreeJournal[],
  perimetre: [] as { coproCode: string; managerId: string }[],
  copros: [] as { code: string; nom: string; statut: "active" | "inactive"; equipe: { nomComplet: string; role: string; initiales: string }[] }[],
  seq: 0,
}));

vi.mock("@/lib/adapters/router", () => ({
  getContratsCoproRepository: () => ({
    async getFicheImmeuble(code: string) {
      const f = etat.fiches.get(code);
      return f ? structuredClone(f) : null;
    },
    async listerFichesImmeuble(codes?: readonly string[]) {
      const out = new Map<string, FicheImmeuble>();
      for (const [c, f] of etat.fiches) if (!codes || codes.includes(c)) out.set(c, structuredClone(f));
      return out;
    },
    async sauverFicheImmeuble(coproCode: string, patch: PatchFicheImmeuble) {
      etat.patches.push({ coproCode, patch });
      const f = etat.fiches.get(coproCode) ?? vide(coproCode);
      etat.fiches.set(coproCode, { ...f, ...patch });
    },
    async creerBatiment(b: Omit<Batiment, "id">) {
      const cree = { ...b, id: `bat-${++etat.seq}` };
      const f = etat.fiches.get(b.coproCode) ?? vide(b.coproCode);
      f.batiments.push(cree);
      etat.fiches.set(b.coproCode, f);
      return { ...cree };
    },
    async sauverBatiment(b: Batiment) {
      const f = etat.fiches.get(b.coproCode)!;
      f.batiments = f.batiments.map((x) => (x.id === b.id ? { ...b } : x));
    },
    async supprimerBatiment(id: string) {
      for (const f of etat.fiches.values()) f.batiments = f.batiments.filter((b) => b.id !== id);
    },
    async getContratCourant(code: string) {
      return etat.contrats.get(code) ?? null;
    },
  }),
}));
vi.mock("./journal", () => ({
  async journaliser(e: NouvelleEntreeJournal) {
    etat.journal.push(e);
  },
}));
vi.mock("@/lib/services/coproprietes/exiger-perimetre", () => ({
  async exigerPerimetre(coproCode: string, managerId: string) {
    etat.perimetre.push({ coproCode, managerId });
    if (coproCode === "S0999") throw new Error("Copropriété hors du périmètre du gestionnaire.");
  },
}));
vi.mock("@/lib/services/coproprietes/perimetre-lecture", () => ({
  async coprosEnLecture() {
    return etat.copros;
  },
}));

import { creerBatiment, ficheImmeubleDe, immeublesACompleter, modifierBatiment, modifierImmeuble, prefillerBatiments, supprimerBatiment } from "./immeuble";

function vide(coproCode: string): FicheImmeuble {
  return {
    coproCode,
    surfaceM2: null,
    anneeConstruction: null,
    periodeConstruction: null,
    nombreBatiments: null,
    chauffageType: null,
    chauffageEnergie: null,
    chauffageSysteme: null,
    ecsType: null,
    ecsSysteme: null,
    ecsMemeQueChauffage: null,
    ventilationType: null,
    ventilationSysteme: null,
    bornesRechargeVE: null,
    locauxVelos: null,
    dpeCollectifRealise: null,
    diagnosticStructureRealise: null,
    pptInscritAG: null,
    pptVote: null,
    pptAdoptionISO: null,
    primeAssuranceActuelle: null,
    notes: null,
    batiments: [],
  };
}

function complete(coproCode: string): FicheImmeuble {
  return {
    ...vide(coproCode),
    surfaceM2: 2400,
    anneeConstruction: 1972,
    periodeConstruction: "DE_1949_A_1974",
    nombreBatiments: 1,
    chauffageType: "COLLECTIF",
    chauffageEnergie: "GAZ",
    chauffageSysteme: "CHAUDIERE_CONDENSATION",
    ecsType: "COLLECTIF",
    ecsMemeQueChauffage: true,
    ventilationType: "COLLECTIF",
    ventilationSysteme: "MECANIQUE",
    bornesRechargeVE: "non",
    locauxVelos: "oui",
    dpeCollectifRealise: "oui",
    diagnosticStructureRealise: "non",
    pptVote: "oui",
    pptAdoptionISO: "2025-06-12",
    batiments: [{ id: "bat-a", coproCode, nom: "Bâtiment A", anneeConstruction: 1972, nombreEtages: 5, nombreAscenseurs: 1, etiquetteEnergie: "D" }],
  };
}

const AUTEUR = { id: "u-fanny", nom: "Fanny Dupont" };
const ANNEE = 2026;

beforeEach(() => {
  etat.fiches.clear();
  etat.contrats.clear();
  etat.patches.length = 0;
  etat.journal.length = 0;
  etat.perimetre.length = 0;
  etat.copros = [];
  etat.seq = 0;
});

describe("ficheImmeubleDe", () => {
  it("rend une fiche vide, code posé, quand la copro n'en a pas", async () => {
    const f = await ficheImmeubleDe("S0247");
    expect(f.coproCode).toBe("S0247");
    expect(f.batiments).toEqual([]);
    expect(f.chauffageType).toBeNull();
  });

  it("rend la fiche existante", async () => {
    etat.fiches.set("S0247", complete("S0247"));
    expect((await ficheImmeubleDe("S0247")).surfaceM2).toBe(2400);
  });
});

describe("modifierImmeuble", () => {
  it("vérifie le périmètre, applique les cascades et journalise les champs changés", async () => {
    etat.fiches.set("S0247", complete("S0247"));
    await modifierImmeuble({ coproCode: "S0247", patch: { chauffageType: "INDIVIDUEL", chauffageEnergie: "RESEAU_CHALEUR", surfaceM2: 2400 }, anneeCourante: ANNEE }, AUTEUR);
    expect(etat.perimetre).toEqual([{ coproCode: "S0247", managerId: "u-fanny" }]);
    // Réseau de chaleur interdit en individuel : énergie et système tombent ; la surface inchangée n'est pas réécrite.
    expect(etat.patches).toEqual([{ coproCode: "S0247", patch: { chauffageType: "INDIVIDUEL", chauffageEnergie: null, chauffageSysteme: null } }]);
    expect(etat.journal).toHaveLength(1);
    expect(etat.journal[0]).toMatchObject({ coproCode: "S0247", type: "immeuble_modifie", parUserId: "u-fanny", parNom: "Fanny Dupont", sujet: null, cycleId: null });
    expect(etat.journal[0].details.champs).toEqual(["Type de chauffage", "Énergie de chauffage", "Système de chauffage"]);
  });

  it("crée la fiche au premier geste quand elle n'existe pas", async () => {
    await modifierImmeuble({ coproCode: "S0300", patch: { surfaceM2: 1200.5, notes: "  RDC commercial  " }, anneeCourante: ANNEE }, AUTEUR);
    expect(etat.patches).toEqual([{ coproCode: "S0300", patch: { surfaceM2: 1200.5, notes: "RDC commercial" } }]);
    expect(etat.fiches.get("S0300")?.surfaceM2).toBe(1200.5);
  });

  it("un patch sans effet n'écrit rien et ne journalise rien", async () => {
    etat.fiches.set("S0247", complete("S0247"));
    await modifierImmeuble({ coproCode: "S0247", patch: { surfaceM2: 2400, pptVote: "oui" }, anneeCourante: ANNEE }, AUTEUR);
    expect(etat.patches).toEqual([]);
    expect(etat.journal).toEqual([]);
  });

  it("refuse une année hors bornes, une surface nulle, et une copro hors périmètre", async () => {
    await expect(modifierImmeuble({ coproCode: "S0247", patch: { anneeConstruction: 2030 }, anneeCourante: ANNEE }, AUTEUR)).rejects.toThrow(/1600 à 2026/);
    await expect(modifierImmeuble({ coproCode: "S0247", patch: { surfaceM2: 0 }, anneeCourante: ANNEE }, AUTEUR)).rejects.toThrow(/surface/i);
    await expect(modifierImmeuble({ coproCode: "S0999", patch: { surfaceM2: 10 }, anneeCourante: ANNEE }, AUTEUR)).rejects.toThrow(/périmètre/);
    expect(etat.patches).toEqual([]);
  });

  it("refuse une prime d'assurance négative ou illisible (NaN), accepte zéro", async () => {
    await expect(modifierImmeuble({ coproCode: "S0247", patch: { primeAssuranceActuelle: -1 }, anneeCourante: ANNEE }, AUTEUR)).rejects.toThrow(/prime/i);
    await expect(modifierImmeuble({ coproCode: "S0247", patch: { primeAssuranceActuelle: Number.NaN }, anneeCourante: ANNEE }, AUTEUR)).rejects.toThrow(/prime/i);
    expect(etat.patches).toEqual([]);
    await modifierImmeuble({ coproCode: "S0247", patch: { primeAssuranceActuelle: 0 }, anneeCourante: ANNEE }, AUTEUR);
    expect(etat.patches).toHaveLength(1);
  });

  it("PPT non voté : la date d'adoption tombe même si le client l'envoie", async () => {
    etat.fiches.set("S0247", complete("S0247"));
    await modifierImmeuble({ coproCode: "S0247", patch: { pptVote: "non", pptAdoptionISO: "2026-01-01", pptInscritAG: "oui" }, anneeCourante: ANNEE }, AUTEUR);
    expect(etat.patches[0].patch).toEqual({ pptVote: "non", pptAdoptionISO: null, pptInscritAG: "oui" });
  });
});

describe("bâtiments", () => {
  it("créer : périmètre, validation, journal", async () => {
    const b = await creerBatiment({ coproCode: "S0247", nom: " Bâtiment B ", nombreEtages: 4, anneeCourante: ANNEE }, AUTEUR);
    expect(b).toMatchObject({ id: "bat-1", nom: "Bâtiment B", nombreEtages: 4, nombreAscenseurs: null, etiquetteEnergie: null });
    expect(etat.perimetre[0]).toEqual({ coproCode: "S0247", managerId: "u-fanny" });
    expect(etat.journal[0].details.champs).toEqual(["bâtiment « Bâtiment B » ajouté"]);
    await expect(creerBatiment({ coproCode: "S0247", nom: "", anneeCourante: ANNEE }, AUTEUR)).rejects.toThrow(/nom/);
    await expect(creerBatiment({ coproCode: "S0247", nom: "C", nombreEtages: 61, anneeCourante: ANNEE }, AUTEUR)).rejects.toThrow(/0 à 60/);
  });

  it("modifier : seulement les champs fournis, journal des champs changés, refus si étranger à la copro", async () => {
    etat.fiches.set("S0247", complete("S0247"));
    const b = await modifierBatiment({ coproCode: "S0247", batimentId: "bat-a", nombreEtages: 6, etiquetteEnergie: "C", anneeCourante: ANNEE }, AUTEUR);
    expect(b).toMatchObject({ nom: "Bâtiment A", anneeConstruction: 1972, nombreEtages: 6, etiquetteEnergie: "C" });
    expect(etat.fiches.get("S0247")?.batiments[0].nombreEtages).toBe(6);
    expect(etat.journal[0].details.champs).toEqual(["bâtiment « Bâtiment A » : étages, étiquette énergie"]);
    await expect(modifierBatiment({ coproCode: "S0300", batimentId: "bat-a", nombreEtages: 1, anneeCourante: ANNEE }, AUTEUR)).rejects.toThrow(/introuvable/);
  });

  it("modifier sans changement : rien n'est écrit", async () => {
    etat.fiches.set("S0247", complete("S0247"));
    await modifierBatiment({ coproCode: "S0247", batimentId: "bat-a", nombreEtages: 5, anneeCourante: ANNEE }, AUTEUR);
    expect(etat.journal).toEqual([]);
  });

  it("supprimer : la ligne disparaît, le journal garde le nom", async () => {
    etat.fiches.set("S0247", complete("S0247"));
    await supprimerBatiment({ coproCode: "S0247", batimentId: "bat-a" }, AUTEUR);
    expect(etat.fiches.get("S0247")?.batiments).toEqual([]);
    expect(etat.journal[0].details.champs).toEqual(["bâtiment « Bâtiment A » supprimé"]);
    await expect(supprimerBatiment({ coproCode: "S0247", batimentId: "bat-a" }, AUTEUR)).rejects.toThrow(/introuvable/);
  });

  it("pré-remplir : complète jusqu'au nombre annoncé, année de la fiche, ascenseurs du compteur", async () => {
    etat.fiches.set("S0247", { ...complete("S0247"), nombreBatiments: 3 });
    etat.contrats.set("S0247", { compteurs: { ascenseurs: 3, chaudieres: 1, vmcGaz: 0 } } as ContratCourant);
    const crees = await prefillerBatiments({ coproCode: "S0247" }, AUTEUR);
    expect(crees.map((b) => b.nom)).toEqual(["Bâtiment B", "Bâtiment C"]);
    expect(crees.map((b) => b.anneeConstruction)).toEqual([1972, 1972]);
    expect(crees.map((b) => b.nombreAscenseurs)).toEqual([1, 1]);
    expect(etat.fiches.get("S0247")?.batiments).toHaveLength(3);
    expect(etat.journal[0].details.champs).toEqual(["2 bâtiments pré-remplis (B, C)"]);
  });

  it("pré-remplir : refuse sans nombre de bâtiments ou quand tout est déjà saisi", async () => {
    await expect(prefillerBatiments({ coproCode: "S0247" }, AUTEUR)).rejects.toThrow(/nombre de bâtiments/);
    etat.fiches.set("S0247", complete("S0247"));
    await expect(prefillerBatiments({ coproCode: "S0247" }, AUTEUR)).rejects.toThrow(/déjà saisis/);
  });
});

describe("immeublesACompleter", () => {
  it("les copros actives dont la fiche manque de quelque chose, triées par nom, avec le gestionnaire", async () => {
    etat.copros = [
      { code: "S0247", nom: "LES TILLEULS", statut: "active", equipe: [{ nomComplet: "Fanny Dupont", role: "gestionnaire", initiales: "FD" }] },
      { code: "S0300", nom: "ARC EN CIEL", statut: "active", equipe: [] },
      { code: "S0301", nom: "INACTIVE", statut: "inactive", equipe: [] },
    ];
    etat.fiches.set("S0247", complete("S0247"));
    etat.fiches.set("S0301", vide("S0301"));
    const file = await immeublesACompleter();
    expect(file.map((i) => i.coproCode)).toEqual(["S0300"]);
    expect(file[0].coproNom).toBe("ARC EN CIEL");
    expect(file[0].manquants).toContain("Bâtiments");
    expect(file[0].gestionnaire).toBeUndefined();

    etat.fiches.set("S0247", { ...complete("S0247"), ventilationSysteme: null });
    const file2 = await immeublesACompleter();
    expect(file2.map((i) => i.coproCode)).toEqual(["S0300", "S0247"]);
    expect(file2[1]).toMatchObject({ gestionnaire: "Fanny Dupont", manquants: ["Système de ventilation"] });
  });

  it("se restreint aux codes demandés", async () => {
    etat.copros = [
      { code: "S0247", nom: "LES TILLEULS", statut: "active", equipe: [] },
      { code: "S0300", nom: "ARC EN CIEL", statut: "active", equipe: [] },
    ];
    expect((await immeublesACompleter({ coproCodes: ["S0247"] })).map((i) => i.coproCode)).toEqual(["S0247"]);
    expect(await immeublesACompleter({ coproCodes: [] })).toEqual([]);
  });
});
