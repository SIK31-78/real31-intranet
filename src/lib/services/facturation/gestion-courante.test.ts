// Deux sujets dans ce fichier :
//   - Fix B (frais postaux reels) : une copro dont le drapeau frais_postaux_reels
//     est vrai NE doit PAS recevoir de ligne de timbres ;
//   - le FILET DE SECURITE : la selection fait foi, le service rejoue les verdicts
//     avant d'ecrire, et refuse doublon / contrat absent / +20 % non confirme.
// Le repo (routeur) est mocke : il enregistre les factures creees pour inspection.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LigneGestionCourante, NouvelleFacture } from "@/lib/ports/facturation-repository";
import { CATEGORIE_FORFAIT_POSTAUX } from "@/lib/domain/facturation/produits";

const etat = vi.hoisted(() => {
  const ref = {
    base: [] as LigneGestionCourante[],
    creees: [] as NouvelleFacture[],
    reset() {
      ref.base = [];
      ref.creees = [];
    },
  };
  return ref;
});

vi.mock("@/lib/adapters/router", () => ({
  getFacturationRepository: () => ({
    async chargerGestionCourante() {
      return etat.base;
    },
    async creerFacture(input: NouvelleFacture) {
      etat.creees.push(input);
      return `facture-${etat.creees.length}`;
    },
    // Emission neutralisee : rien a emettre (le test porte sur les lignes creees).
    async listerFacturesAEmettre() {
      return [];
    },
    async chargerProduits() {
      return [];
    },
  }),
  // Jamais appele (aucune facture a emettre), mais getInvoicingProvider() est resolu.
  getInvoicingProvider: () => ({}),
}));

import {
  apercuGestionCourante,
  lancerGestionCourante,
} from "@/lib/services/facturation/gestion-courante";

/** Copro de reference : 4 800 TTC/an -> 1 000 HT + 100 de timbres = 1 100 HT. */
function copro(over: Partial<LigneGestionCourante> = {}): LigneGestionCourante {
  return {
    coproCode: "S010",
    honorairesAnnuelsTtc: 4800,
    forfaitPostauxAnnuel: 400,
    fraisPostauxReels: false,
    // Un seul cycle : la regle d'origine. Les cas a deux tarifs ont leurs tests.
    cycles: [],
    dejaFacture: false,
    ...over,
  };
}

/** Selection « tout ce qui est propose », sans confirmation ecrite. */
function tout(): { coproCodes: string[] } {
  return { coproCodes: etat.base.map((l) => l.coproCode) };
}

beforeEach(() => {
  etat.reset();
});

// C (Sekou, 15/09/2026) : changement de tarif en cours de trimestre -> DEUX lignes par
// nature, datees, au prorata des jours. RIVIERE5 : nouveau cycle le 24/04.
describe("gestion courante - changement de tarif en cours de trimestre (C)", () => {
  const ANCIEN = { debutISO: "2025-07-01", honorairesAnnuelsTtc: 4800, forfaitPostauxAnnuel: 400, fraisPostauxReels: false };
  const NOUVEAU = { debutISO: "2026-04-24", honorairesAnnuelsTtc: 6400, forfaitPostauxAnnuel: 400, fraisPostauxReels: false };

  it("facture T2 en deux tarifs dates, honoraires et timbres chacun, conforme au contrat", async () => {
    etat.base = [copro({ cycles: [ANCIEN, NOUVEAU] })];

    await lancerGestionCourante("2026-T2", "AB", tout());

    const lignes = etat.creees[0]!.lignes;
    expect(lignes.map((l) => l.description)).toEqual([
      "Honoraires de gestion courante - 2026-T2 (du 01/04/2026 au 23/04/2026)",
      "Forfait de frais postaux - 2026-T2 (du 01/04/2026 au 23/04/2026)",
      "Honoraires de gestion courante - 2026-T2 (du 24/04/2026 au 30/06/2026)",
      "Forfait de frais postaux - 2026-T2 (du 24/04/2026 au 30/06/2026)",
    ]);
    // 1 000 HT x 23/91 + 1 333,33 HT x 68/91
    const honoraires = lignes[0]!.prixUnitaireHt + lignes[2]!.prixUnitaireHt;
    expect(honoraires).toBeCloseTo((1000 * 23 + (6400 / 4 / 1.2) * 68) / 91, 6);
    // Les timbres suivent le meme decoupage : 100 x 23/91 + 100 x 68/91 = 100.
    expect(lignes[1]!.prixUnitaireHt + lignes[3]!.prixUnitaireHt).toBeCloseTo(100, 9);
  });

  it("l'apercu dit le changement de tarif, et la ligne reste cochable en masse (aucune alerte)", async () => {
    etat.base = [copro({ cycles: [ANCIEN, NOUVEAU] })];
    const a = await apercuGestionCourante("2026-T2");
    const l = a.lignes[0]!;
    expect(l.verdict).toBe("ok");
    expect(l.message).toMatch(/Changement de tarif le 24\/04\/2026/);
  });

  it("T2 facture apres le 1er juillet reste a l'ancien tarif : la reference est le trimestre, pas le jour", async () => {
    const juillet = { ...NOUVEAU, debutISO: "2026-07-01" };
    etat.base = [copro({ cycles: [ANCIEN, juillet] })];

    await lancerGestionCourante("2026-T2", "AB", tout());

    const lignes = etat.creees[0]!.lignes;
    expect(lignes).toHaveLength(2);
    expect(lignes[0]!.prixUnitaireHt).toBeCloseTo(1000, 9);
  });
});

describe("gestion courante - frais postaux reels (Fix B)", () => {
  it("copro en frais reels : facture SANS ligne de timbres (1 seule ligne)", async () => {
    etat.base = [copro({ fraisPostauxReels: true })];

    await lancerGestionCourante("2026-T3", "AB", tout());

    expect(etat.creees).toHaveLength(1);
    const lignes = etat.creees[0]!.lignes;
    expect(lignes).toHaveLength(1); // honoraires seulement
    expect(lignes.some((l) => l.categorieProduit === CATEGORIE_FORFAIT_POSTAUX)).toBe(false);
  });

  it("copro au forfait : facture AVEC ligne de timbres (2 lignes)", async () => {
    etat.base = [copro({ coproCode: "S011" })];

    await lancerGestionCourante("2026-T3", "AB", tout());

    const lignes = etat.creees[0]!.lignes;
    expect(lignes).toHaveLength(2);
    const timbres = lignes.find((l) => l.categorieProduit === CATEGORIE_FORFAIT_POSTAUX);
    expect(timbres?.prixUnitaireHt).toBe(100); // 400 / 4, sans TVA
  });

  it("apercu : frais reels -> timbres a 0 dans le recapitulatif", async () => {
    etat.base = [copro({ fraisPostauxReels: true })];
    const apercu = await apercuGestionCourante("2026-T3");
    expect(apercu.totalTimbres).toBe(0);
    expect(apercu.lignes[0]!.timbres).toBe(0);
  });
});

describe("gestion courante - filet : apercu", () => {
  it("ligne normale : verdict ok, cochable par « tout selectionner »", async () => {
    etat.base = [copro()];
    const a = await apercuGestionCourante("2026-T3");
    const l = a.lignes[0]!;
    expect(l.verdict).toBe("ok");
    expect(l.montantHt).toBeCloseTo(1100, 8);
    expect(l.attenduHt).toBeCloseTo(1100, 8);
    expect(l.selectionnableEnMasse).toBe(true);
    expect(a.nbAFacturer).toBe(1);
    expect(a.ecartHt).toBeCloseTo(0, 8);
  });

  it("deja facturee : ligne grisee avec la date, hors des totaux", async () => {
    etat.base = [copro({ dejaFacture: true, dejaFactureLe: "2026-07-02" })];
    const a = await apercuGestionCourante("2026-T3");
    expect(a.lignes[0]!.verdict).toBe("deja_facturee");
    expect(a.lignes[0]!.dejaFactureLe).toBe("02/07/2026");
    expect(a.lignes[0]!.message).toContain("02/07/2026");
    expect(a.nbAFacturer).toBe(0);
    expect(a.nbDejaFacturees).toBe(1);
    expect(a.totalHt).toBe(0);
  });

  it("contrat absent : ligne signalee, jamais comptee dans la fournee", async () => {
    etat.base = [copro({ honorairesAnnuelsTtc: null, forfaitPostauxAnnuel: 0 })];
    const a = await apercuGestionCourante("2026-T3");
    expect(a.lignes[0]!.verdict).toBe("contrat_absent");
    expect(a.lignes[0]!.message).toMatch(/non renseign/i);
    expect(a.nbContratAbsent).toBe(1);
    expect(a.nbAFacturer).toBe(0);
  });

  it("contrat a 0 EUR : meme traitement, message distinct", async () => {
    etat.base = [copro({ honorairesAnnuelsTtc: 0, forfaitPostauxAnnuel: 0 })];
    const a = await apercuGestionCourante("2026-T3");
    expect(a.lignes[0]!.verdict).toBe("contrat_absent");
    expect(a.lignes[0]!.message).toContain("0 €");
  });

  it("copro reprise en cours de trimestre : prorata facture, badge neutre", async () => {
    etat.base = [copro({ coproCode: "S301", priseEnGestion: "2026-04-11T00:00:00" })];
    const a = await apercuGestionCourante("2026-T2");
    const l = a.lignes[0]!;
    expect(l.verdict).toBe("prorata");
    expect(l.prorataJours).toBe(81);
    expect(l.prorataJoursTrimestre).toBe(91);
    expect(l.montantHt).toBeCloseTo(1100 * (81 / 91), 6);
    expect(l.attenduPleinHt).toBeCloseTo(1100, 6); // le trimestre plein reste lisible
    expect(l.selectionnableEnMasse).toBe(true); // un prorata n'est PAS une alerte
    expect(a.nbProrata).toBe(1);
    expect(a.ecartHt).toBeCloseTo(0, 6);
    expect(a.totalContratPleinHt).toBeCloseTo(1100, 6);
  });

  it("le recap de fournee expose ce qui part, l'attendu et l'ecart", async () => {
    etat.base = [copro({ coproCode: "S001" }), copro({ coproCode: "S002" })];
    const a = await apercuGestionCourante("2026-T3");
    expect(a.nbAFacturer).toBe(2);
    expect(a.totalHt).toBeCloseTo(2200, 8);
    expect(a.totalAttenduHt).toBeCloseTo(2200, 8);
    expect(a.totalHtLibelle).toContain("€");
  });
});

describe("gestion courante - filet : lancement", () => {
  it("seules les copros SELECTIONNEES partent", async () => {
    etat.base = [copro({ coproCode: "S001" }), copro({ coproCode: "S002" })];
    await lancerGestionCourante("2026-T3", "AB", { coproCodes: ["S002"] });
    expect(etat.creees.map((f) => f.coproCode)).toEqual(["S002"]);
  });

  it("selection vide : rien ne part", async () => {
    etat.base = [copro()];
    const r = await lancerGestionCourante("2026-T3", "AB", { coproCodes: [] });
    expect(etat.creees).toHaveLength(0);
    expect(r.facturesCreees).toBe(0);
  });

  it("le filet est REJOUE cote serveur : un doublon selectionne est refuse", async () => {
    etat.base = [copro({ dejaFacture: true, dejaFactureLe: "2026-07-02" })];
    const r = await lancerGestionCourante("2026-T3", "AB", tout());
    expect(etat.creees).toHaveLength(0);
    expect(r.ignorees).toEqual([
      { coproCode: "S010", motif: "Déjà facturée le 02/07/2026 pour ce trimestre." },
    ]);
  });

  it("un contrat absent selectionne est refuse, jamais emis a 0 EUR", async () => {
    etat.base = [copro({ honorairesAnnuelsTtc: null, forfaitPostauxAnnuel: 0 })];
    const r = await lancerGestionCourante("2026-T3", "AB", tout());
    expect(etat.creees).toHaveLength(0);
    expect(r.ignorees[0]!.motif).toMatch(/non renseign/i);
  });

  it("une copro inconnue du trimestre est signalee, pas silencieuse", async () => {
    etat.base = [copro({ coproCode: "S001" })];
    const r = await lancerGestionCourante("2026-T3", "AB", { coproCodes: ["S001", "S999"] });
    expect(etat.creees).toHaveLength(1);
    expect(r.ignorees).toEqual([
      { coproCode: "S999", motif: "Copropriété absente de la base facturable de ce trimestre." },
    ]);
  });

  it("un refus n'interrompt pas la fournee : les autres partent", async () => {
    etat.base = [
      copro({ coproCode: "S001", dejaFacture: true }),
      copro({ coproCode: "S002" }),
      copro({ coproCode: "S003", honorairesAnnuelsTtc: 0, forfaitPostauxAnnuel: 0 }),
      copro({ coproCode: "S004" }),
    ];
    const r = await lancerGestionCourante("2026-T3", "AB", tout());
    expect(etat.creees.map((f) => f.coproCode)).toEqual(["S002", "S004"]);
    expect(r.facturesCreees).toBe(2);
    expect(r.ignorees).toHaveLength(2);
  });

  it("la facture garde la trace du filet dans ses details", async () => {
    etat.base = [copro({ coproCode: "S301", priseEnGestion: "2026-04-11" })];
    await lancerGestionCourante("2026-T2", "AB", tout());
    const details = etat.creees[0]!.details!;
    expect(details["verdict"]).toBe("prorata");
    expect(details["prorataJours"]).toBe(81);
    expect(details["attenduHt"]).toBeCloseTo(1100 * (81 / 91), 6);
  });

  it("prise en gestion posterieure au trimestre : aucune facture a 0 EUR", async () => {
    etat.base = [copro({ priseEnGestion: "2026-07-15" })];
    const apercu = await apercuGestionCourante("2026-T2");
    expect(apercu.nbAFacturer).toBe(0);
    await lancerGestionCourante("2026-T2", "AB", tout());
    expect(etat.creees).toHaveLength(0);
  });
});
