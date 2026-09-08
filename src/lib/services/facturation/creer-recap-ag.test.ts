// Fix A (fail-loud) cote depassement AG : une duree d'AG ou une plage horaire NON
// renseignee (NULL) doit LEVER plutot que d'etre traitee comme 0/defaut permissif
// (une duree d'AG absente ferait basculer toute l'assemblee en depassement). On
// teste par l'apercu, qui partage le calcul avec la creation (meme garde).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParametresCopro } from "@/lib/ports/facturation-repository";

const etat = vi.hoisted(() => {
  const complet = { franchiseCsHeures: 1, dureeAgHeures: 2, debutMinAgHeure: 10, finMaxAgHeure: 20 };
  const ref = {
    parametres: { ...complet } as ParametresCopro,
    facturesCreees: [] as unknown[],
    recapsCrees: [] as { statut?: string; depassementHeures?: number }[],
    reset() {
      ref.parametres = { ...complet };
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
    async creerRecapAg(r: { statut?: string; depassementHeures?: number }) {
      etat.recapsCrees.push(r);
      return "recap-1";
    },
    async rattacherFacture() {},
  }),
  getComptaRepository: () => ({
    async ajouterNote() {},
  }),
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
