// Fix A (fail-loud) cote depassement AG : une duree d'AG ou une plage horaire NON
// renseignee (NULL) doit LEVER plutot que d'etre traitee comme 0/defaut permissif
// (une duree d'AG absente ferait basculer toute l'assemblee en depassement). On
// teste par l'apercu, qui partage le calcul avec la creation (meme garde).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParametresCopro } from "@/lib/ports/facturation-repository";

const etat = vi.hoisted(() => {
  const complet = { franchiseCsHeures: 1, dureeAgHeures: 2, debutMinAgHeure: 10, finMaxAgHeure: 20 };
  const ref = {
    parametres: { ...complet } as ParametresCopro,
    facturesCreees: [] as unknown[],
    recapsCrees: [] as { statut?: string; depassementHeures?: number }[],
    /** Dates d'AG des recaps deja saisis pour la copro (REA-166). */
    datesRecaps: [] as string[],
    reset() {
      ref.parametres = { ...complet };
      ref.datesRecaps = [];
      ref.facturesCreees = [];
      ref.recapsCrees = [];
    },
  };
  return ref;
});

vi.mock("@/lib/adapters/router", () => ({
  getFacturationRepository: () => ({
    async getParametresCopro() {
      return etat.parametres;
    },
    async getTarifTtc() {
      return 120;
    },
    async creerFacture(f: unknown) {
      etat.facturesCreees.push(f);
      return "fac-1";
    },
  }),
  getRecapAgRepository: () => ({
    async existeRecap() {
      return false;
    },
    async listerDatesAgParCopro(codes: readonly string[]) {
      return new Map(etat.datesRecaps.length > 0 ? [[codes[0], etat.datesRecaps]] : []);
    },
    async creerRecapAg(r: { statut?: string; depassementHeures?: number }) {
      etat.recapsCrees.push(r);
      return "recap-1";
    },
    async rattacherFacture() {},
  }),
  getComptaRepository: () => ({
    async ajouterNote() {},
  }),
  // Notification comptable : sans boite d'envoi dans ces tests, le service n'envoie rien.
  getCoproRepository: () => ({ async findByCode() { return null; } }),
  getAgenceRepository: () => ({ async listerAgences() { return []; } }),
  getMailOutboundProvider: () => ({ async envoyerNeuf() {} }),
  // marquerRecapFait est best-effort : un provider qui jette est avale (warn).
  getSupervisionAgProvider: () => ({
    async setStatutItem() {},
  }),
}));

import { apercuRecapAg, creerRecapAg } from "@/lib/services/facturation/creer-recap-ag";

// AG de 3 h dans la plage 10 h-20 h (depassement attendu quand les params existent).
const assemblee = {
  jourDebut: "2026-06-10",
  heureDebut: 14,
  minuteDebut: 0,
  jourFin: "2026-06-10",
  heureFin: 17,
  minuteFin: 0,
};

beforeEach(() => {
  etat.reset();
  // « Aujourd'hui » fige deux jours apres l'AG : les controles de date (REA-166) ne
  // doivent pas faire vieillir ces tests.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-12T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

// REA-166 : un recap = une AG. Les dates suspectes se confirment, la meme date se refuse.
describe("recap AG - controle de la date d'AG", () => {
  it("meme AG deja recapee : l'apercu s'arrete", async () => {
    etat.datesRecaps = ["2026-06-10"];
    await expect(apercuRecapAg({ coproCode: "S002", assemblee }, "m1")).rejects.toThrow(/une assemblée n'a qu'un récap/);
  });

  it("autre recap a moins de 10 mois : l'apercu le signale, l'enregistrement exige la confirmation", async () => {
    etat.datesRecaps = ["2025-09-24"];
    const apercu = await apercuRecapAg({ coproCode: "S002", assemblee }, "m1");
    expect(apercu.confirmationsDate?.[0]).toMatch(/24\/09\/2025/);
    expect(apercu.avertissements?.[0]).toMatch(/Vérifiez l'année/);
    await expect(creerRecapAg({ coproCode: "S002", assemblee }, "m1")).rejects.toThrow(/Confirmez la date/);
    expect(etat.recapsCrees).toHaveLength(0);
    const r = await creerRecapAg({ coproCode: "S002", assemblee, confirmerDate: true }, "m1");
    expect(r.recapId).toBe("recap-1");
  });

  it("AG de plus de 6 mois : confirmation exigee", async () => {
    const ancienne = { ...assemblee, jourDebut: "2025-06-10", jourFin: "2025-06-10" };
    const apercu = await apercuRecapAg({ coproCode: "S002", assemblee: ancienne }, "m1");
    expect(apercu.confirmationsDate?.[0]).toMatch(/plus de 6 mois/);
    await expect(creerRecapAg({ coproCode: "S002", assemblee: ancienne }, "m1")).rejects.toThrow(/Confirmez la date/);
  });

  it("date propre : ni alerte ni confirmation", async () => {
    etat.datesRecaps = ["2025-06-05"];
    const apercu = await apercuRecapAg({ coproCode: "S002", assemblee }, "m1");
    expect(apercu.confirmationsDate).toBeUndefined();
  });
});

describe("recap AG - parametres d'AG non renseignes (Fix A)", () => {
  it("duree d'AG NULL -> leve une erreur actionnable nommant la copro", async () => {
    etat.parametres = { ...etat.parametres, dureeAgHeures: null };
    await expect(apercuRecapAg({ coproCode: "S002", assemblee }, "m1")).rejects.toThrow(
      /Paramètres d'AG non renseignés pour la copropriété S002/,
    );
  });

  it("borne de plage (finMaxAgHeure) NULL -> leve aussi", async () => {
    etat.parametres = { ...etat.parametres, finMaxAgHeure: null };
    await expect(apercuRecapAg({ coproCode: "S002", assemblee }, "m1")).rejects.toThrow(
      /à compléter sur la fiche avant de facturer le dépassement/,
    );
  });

  it("parametres complets (dont un 0 explicite en borne) : pas de blocage", async () => {
    // debutMinAgHeure 0 EXPLICITE = plage a partir de minuit, valeur assumee, pas absente.
    etat.parametres = { franchiseCsHeures: 1, dureeAgHeures: 2, debutMinAgHeure: 0, finMaxAgHeure: 20 };
    const apercu = await apercuRecapAg({ coproCode: "S002", assemblee }, "m1");
    expect(apercu.typePrestation).toBe("depassement_ag");
  });
});

// Sans depassement, l'apercu doit quand meme proposer une ACTION : le recap est le
// livrable, la facture n'en est qu'une retombee. La fenetre de validation cache son
// bouton quand rienAFacturer est vrai -- sans actionSansFacture, une AG tenue dans
// les horaires du contrat ne pouvait pas etre enregistree du tout.
describe("recap AG - AG dans les horaires du contrat", () => {
  // 2 h entre 10 h et 20 h, pour une duree contractuelle de 2 h : aucun depassement.
  const dansLesClous = {
    jourDebut: "2026-06-10",
    heureDebut: 18,
    minuteDebut: 0,
    jourFin: "2026-06-10",
    heureFin: 20,
    minuteFin: 0,
  };

  it("rien a facturer, mais le recap reste a enregistrer", async () => {
    const apercu = await apercuRecapAg({ coproCode: "S002", assemblee: dansLesClous }, "m1");
    expect(apercu.rienAFacturer).toBe(true);
    expect(apercu.montantTtc).toBe(0);
    expect(apercu.actionSansFacture).toBe("Enregistrer le récap");
  });

  it("avec depassement, pas d'action de repli : le bouton d'envoi normal suffit", async () => {
    const apercu = await apercuRecapAg({ coproCode: "S002", assemblee }, "m1");
    expect(apercu.rienAFacturer).toBe(false);
    expect(apercu.actionSansFacture).toBeUndefined();
  });
});

// Renoncement a la facture (demande Sekou 2026-09-08) : le gestionnaire peut
// enregistrer le recap avec le VRAI creneau (depassement calcule et trace) sans
// qu'aucune facture ne parte - geste commercial, jamais une falsification d'heure.
describe("recap AG - 'Ne pas facturer' le depassement", () => {
  it("l'apercu avec depassement propose le bouton secondaire", async () => {
    const apercu = await apercuRecapAg({ coproCode: "S002", assemblee }, "m1");
    expect(apercu.actionNePasFacturer).toBe("Ne pas facturer");
  });

  it("l'apercu sans depassement ne le propose pas (rien a renoncer)", async () => {
    const dansLesClous = { ...assemblee, heureDebut: 18, heureFin: 20, minuteFin: 0 };
    const apercu = await apercuRecapAg({ coproCode: "S002", assemblee: dansLesClous }, "m1");
    expect(apercu.actionNePasFacturer).toBeUndefined();
  });

  it("sansFacture : recap enregistre 'termine' avec le depassement trace, AUCUNE facture", async () => {
    const res = await creerRecapAg({ coproCode: "S002", assemblee, sansFacture: true }, "m1");
    expect(res.factureId).toBeNull();
    expect(res.depassementHeures).toBe(1); // 3 h - 2 h incluses : la verite reste rendue
    expect(res.montantTtc).toBe(0);
    expect(etat.facturesCreees).toHaveLength(0);
    expect(etat.recapsCrees[0]).toMatchObject({ statut: "termine", depassementHeures: 1 });
  });

  it("sans le drapeau, le meme creneau facture bien le depassement", async () => {
    const res = await creerRecapAg({ coproCode: "S002", assemblee }, "m1");
    expect(res.factureId).toBe("fac-1");
    expect(etat.facturesCreees).toHaveLength(1);
    expect(etat.recapsCrees[0]).toMatchObject({ statut: "a_facturer" });
  });
});

// Remontee a4c0f7a6 : des honoraires saisis sans date de debut n'ouvraient aucun cycle de
// contrat, en silence, alors que le mail au comptable affichait le montant.
describe("recap AG - honoraires du nouveau contrat sans date de debut", () => {
  it("creation refusee avec un message qui dit quoi faire, rien n'est ecrit", async () => {
    await expect(
      creerRecapAg({ coproCode: "S002", assemblee, honorairesGestionTtc: 2400 }, "m1"),
    ).rejects.toThrow(/date de début du contrat/);
    expect(etat.recapsCrees).toHaveLength(0);
    expect(etat.facturesCreees).toHaveLength(0);
  });

  it("l'apercu refuse aussi, avant meme la validation", async () => {
    await expect(
      apercuRecapAg({ coproCode: "S002", assemblee, honorairesGestionTtc: 2400 }, "m1"),
    ).rejects.toThrow(/date de début du contrat/);
  });

  it("sans honoraires (ou a 0), pas de date exigee", async () => {
    await expect(creerRecapAg({ coproCode: "S002", assemblee }, "m1")).resolves.toBeDefined();
    etat.reset();
    await expect(
      creerRecapAg({ coproCode: "S002", assemblee, honorairesGestionTtc: 0 }, "m1"),
    ).resolves.toBeDefined();
  });
});
