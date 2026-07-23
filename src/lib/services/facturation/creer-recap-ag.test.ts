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
    reset() {
      ref.parametres = { ...complet };
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
  }),
}));

import { apercuRecapAg } from "@/lib/services/facturation/creer-recap-ag";

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
