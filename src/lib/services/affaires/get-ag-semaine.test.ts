// Test du service "AG - les plus urgentes" (bandeau de l'accueil dossiers). Verifie :
//  - le filtre HORIZON (echeance datee > 21 j ecartee), + les cas retard / suivi post-AG ;
//  - le TRI par urgence (retard d'abord, puis J-x, puis suivi post-AG) ;
//  - que l'action affichee est DERIVEE d'actionDuMoment (heritage S2 : une AG tenue non
//    conclue montre "Conclure l'AG", pas une action a contre-temps).
// Le calcul metier n'est PAS mocke (calculerCycleAg, source unique) ; seuls le routeur et
// le service de supervision le sont.

import { describe, expect, it, vi } from "vitest";
import type { Copropriete } from "@/lib/domain/copropriete";

const TODAY = "2026-07-15";

// Copro minimale valide (les champs non pertinents sont neutres).
function copro(over: Partial<Copropriete> & { code: string }): Copropriete {
  return {
    source: "crypto",
    nom: over.code,
    adresse: { ligne1: "1 rue Test", codePostal: "31000", ville: "Toulouse" },
    statut: "active",
    lotsPrincipaux: 10,
    lotsAutres: 0,
    exercice: { debut: "01/01", fin: "31/12" },
    priseEnGestion: "2018",
    equipe: [],
    ...over,
  };
}

const COPROS: Copropriete[] = [
  // a_planifier EN RETARD (pas de prochaine AG, delai legal cloture+6m depasse) -> urgence max.
  copro({ code: "RETARD" }),
  // convoquee, AG dans 10 j (CS + ODJ + CONVOC faits) -> etape tenue, J-10 -> DANS l'horizon.
  copro({ code: "CONVOC10", prochaineAg: { date: "2026-07-25", statut: "convoquee" }, prochaineCsDate: "2026-06-01" }),
  // convoquee, AG dans 40 j -> J-40 -> HORS horizon (exclue).
  copro({ code: "CONVOC40", prochaineAg: { date: "2026-08-24", statut: "convoquee" }, prochaineCsDate: "2026-06-01" }),
  // AG datee dans le passe, supervision non conclue -> "Conclure l'AG" (suivi post-AG).
  copro({ code: "TENUE", prochaineAg: { date: "2026-07-10", statut: "convoquee" } }),
  // AG datee dans le passe mais supervision CONCLUE -> plus d'action -> exclue.
  copro({ code: "CONCLU", prochaineAg: { date: "2026-07-08", statut: "convoquee" } }),
];

vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () => ({
    async list() {
      return COPROS;
    },
  }),
  getJalonRepository: () => ({
    // ODJ_CS + CONVOC accomplis pour les deux copros convoquees (pour atteindre l'etape tenue).
    async getEtats() {
      const acc = (coproCode: string, agDate: string) =>
        (["ODJ_CS", "CONVOC"] as const).map((type) => ({ coproCode, agDate, type, statut: "accompli" as const }));
      return [...acc("CONVOC10", "2026-07-25"), ...acc("CONVOC40", "2026-08-24")];
    },
  }),
  getSupervisionAgProvider: () => ({
    // Batch : statut par cle "CODE__DATE". TENUE non conclue -> "Conclure l'AG" ;
    // CONCLU conclue -> plus d'action (exclue). Toute autre cle = "en_preparation" par defaut.
    async getStatuts(agIds: string[]) {
      const out = new Map<string, string>();
      for (const id of agIds) {
        if (id === "CONCLU__2026-07-08") out.set(id, "conclue_archivee");
        else out.set(id, "en_preparation");
      }
      return out;
    },
  }),
}));

// Fige la date du jour (le service lit new Date()).
vi.useFakeTimers();
vi.setSystemTime(new Date(`${TODAY}T09:00:00Z`));

import { getAgSemaine } from "@/lib/services/affaires/get-ag-semaine";

describe("getAgSemaine", () => {
  it("filtre l'horizon, trie par urgence, derive l'action d'actionDuMoment", async () => {
    const lignes = await getAgSemaine("g1");
    const codes = lignes.map((l) => l.coproCode);

    // CONVOC40 (J-40, hors horizon) et CONCLU (AG conclue, plus d'action) sont exclues.
    expect(codes).not.toContain("CONVOC40");
    expect(codes).not.toContain("CONCLU");

    // Ordre par urgence : retard (0) -> J-10 (11) -> suivi post-AG (900).
    expect(codes).toEqual(["RETARD", "CONVOC10", "TENUE"]);

    const retard = lignes.find((l) => l.coproCode === "RETARD")!;
    expect(retard.enRetard).toBe(true);
    expect(retard.echeance).toBe("en retard");
    expect(retard.prochaineAction).toBe("fixer les dates CS + AG");

    const convoc10 = lignes.find((l) => l.coproCode === "CONVOC10")!;
    expect(convoc10.echeance).toBe("J-10");
    expect(convoc10.enRetard).toBe(false);

    // Heritage S2 : l'AG tenue non conclue montre "Conclure l'AG" (derive d'actionDuMoment),
    // pas "publier et notifier le PV".
    const tenue = lignes.find((l) => l.coproCode === "TENUE")!;
    expect(tenue.prochaineAction).toBe("conclure l'AG");
    expect(tenue.actionLabel).toBe("Conclure");
  });
});
