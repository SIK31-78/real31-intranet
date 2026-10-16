// Tests de la lecture TRANSVERSE de la fiche copro (fix du 404 comptable) : avec
// { transverse: true } (pole comptable / super-admin), la copro est lue SANS le scope
// managerId -> la fiche s'ouvre sur n'importe quelle copro ; sans le flag, le
// cloisonnement gestionnaire est inchange (hors perimetre -> null -> notFound / 404).
// Router et services composes sont mockes : on ne teste ICI que la resolution du scope.

import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => {
  const ref = {
    // La copro "S024" est geree par g1. findByCode simule le scope de l'adapter :
    // sans managerId -> trouvee ; avec managerId -> trouvee seulement si c'est g1.
    appels: [] as { code: string; managerId?: string }[],
    /** Recaps d'AG par code copro ; `recapsEnPanne` fait echouer la lecture. */
    recaps: {} as Record<string, { id: string; coproCode: string; agDate: string }[]>,
    recapsEnPanne: false,
    /** Fin de mandat du referentiel App A (syndicContractEndDate). */
    mandatSyndicFin: undefined as string | undefined,
    /** Dernier cycle de contrat enregistre par l'intranet, par code copro. */
    contrats: {} as Record<string, { debutContrat: string; finContrat?: string | null; enregistreLeISO?: string }>,
    contratsEnPanne: false,
    /** Echeance d'assurance du referentiel App A. */
    assuranceEcheance: undefined as string | undefined,
    /** Module « Contrats & controles » : courtier du contrat courant, cycles CTQ ascenseur. */
    courtier: null as string | null,
    cyclesCtq: [] as { echeanceISO: string | null; statut?: string; sujet?: string }[],
    contratsCoproEnPanne: false,
    reset() {
      ref.appels.length = 0;
      ref.recaps = {};
      ref.recapsEnPanne = false;
      ref.mandatSyndicFin = undefined;
      ref.contrats = {};
      ref.contratsEnPanne = false;
      ref.assuranceEcheance = undefined;
      ref.courtier = null;
      ref.cyclesCtq = [];
      ref.contratsCoproEnPanne = false;
    },
  };
  return ref;
});

vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () => ({
    async findByCode(code: string, managerId?: string) {
      etat.appels.push({ code, ...(managerId !== undefined ? { managerId } : {}) });
      if (code !== "S024") return null;
      if (managerId !== undefined && managerId !== "g1") return null; // hors scope
      return {
        code: "S024",
        source: "crypto",
        nom: "Résidence Test",
        adresse: { ligne1: "1 rue Test", codePostal: "31000", ville: "Toulouse" },
        statut: "active",
        lotsPrincipaux: 10,
        lotsAutres: 0,
        exercice: { debut: "01/01", fin: "31/12" },
        priseEnGestion: "mars 2018",
        equipe: [],
        ...(etat.mandatSyndicFin ? { mandatSyndicFin: etat.mandatSyndicFin } : {}),
        ...(etat.assuranceEcheance ? { assuranceEcheance: etat.assuranceEcheance } : {}),
      };
    },
  }),
  // Le referentiel d'entreprises (courtiers partenaires) : vide, la liste de repli s'applique.
  getClesEntrepriseRepository: () => ({
    async lister() {
      return [];
    },
  }),
  getContratsCoproRepository: () => ({
    async getContratCourant(code: string) {
      if (etat.contratsCoproEnPanne) throw new Error("table absente");
      return { coproCode: code, assurance: { courtier: etat.courtier } };
    },
    async listerCycles() {
      if (etat.contratsCoproEnPanne) throw new Error("table absente");
      return etat.cyclesCtq.map((c, i) => ({ id: `c${i}`, sujet: c.sujet ?? "ctq_ascenseur", statut: c.statut ?? "en_cours", echeanceISO: c.echeanceISO }));
    },
  }),
  getFacturationRepository: () => ({
    async listerDerniersContrats(codes: string[]) {
      if (etat.contratsEnPanne) throw new Error("base indisponible");
      return new Map(codes.filter((c) => etat.contrats[c]).map((c) => [c, etat.contrats[c]]));
    },
  }),
  getJalonRepository: () => ({
    async getJalons() {
      return [];
    },
  }),
  getGestionnaireRepository: () => ({
    async list() {
      return [];
    },
  }),
  getRecapAgRepository: () => ({
    async listerRecapsDeCopro(code: string) {
      if (etat.recapsEnPanne) throw new Error("base indisponible");
      return etat.recaps[code] ?? [];
    },
  }),
}));
vi.mock("@/lib/services/estale/donnees-copro-estale", () => ({
  donneesCoproEstale: async () => null,
}));
vi.mock("@/lib/services/coproprietes/confirmation-evenement", () => ({
  getConfirmations: async () => [],
}));
vi.mock("@/lib/services/calendrier/get-calendrier", () => ({
  // La fiche derive desormais les prochains evenements localement (pure) au lieu de recharger
  // tout le portefeuille : la copro de test n'a pas de dates -> aucun evenement.
  evenementsDeCopro: () => [],
}));
vi.mock("@/lib/services/compta/get-compta", () => ({
  getEtatCompta: async () => ({ comptesVerifies: false, envoyerAvant: false, checks: {}, notes: [] }),
}));

import { getFicheCopro } from "@/lib/services/fiche-copro/get-fiche-copro";

const TODAY = "2026-07-15";

beforeEach(() => {
  etat.reset();
});

describe("getFicheCopro - scope de lecture", () => {
  it("gestionnaire DE la copro : fiche resolue (cloisonnement inchange)", async () => {
    const fiche = await getFicheCopro("S024", "g1", TODAY);
    expect(fiche?.copro.code).toBe("S024");
    expect(etat.appels[0]).toEqual({ code: "S024", managerId: "g1" });
  });

  it("gestionnaire HORS perimetre, sans transverse : null (-> notFound / 404)", async () => {
    const fiche = await getFicheCopro("S024", "g2", TODAY);
    expect(fiche).toBeNull();
    expect(etat.appels[0]).toEqual({ code: "S024", managerId: "g2" });
  });

  it("comptable (transverse) : la fiche s'ouvre sur une copro qui n'est PAS la sienne", async () => {
    const fiche = await getFicheCopro("S024", "g2", TODAY, { transverse: true });
    expect(fiche?.copro.code).toBe("S024");
    // La lecture transverse interroge SANS scope managerId.
    expect(etat.appels[0]).toEqual({ code: "S024" });
  });

  it("copro inconnue : null meme en transverse (pas d'invention)", async () => {
    const fiche = await getFicheCopro("S999", "g2", TODAY, { transverse: true });
    expect(fiche).toBeNull();
  });
});

describe("getFicheCopro - recaps d'AG", () => {
  it("remonte les recaps de la copro (id + jour de l'AG)", async () => {
    etat.recaps.S024 = [
      { id: "r2", coproCode: "S024", agDate: "2026-06-12" },
      { id: "r1", coproCode: "S024", agDate: "2025-06-10T00:00:00" },
    ];
    const fiche = await getFicheCopro("S024", "g1", TODAY);
    expect(fiche?.recapsAg).toEqual([
      { id: "r2", agDate: "2026-06-12" },
      { id: "r1", agDate: "2025-06-10" },
    ]);
  });

  it("aucun recap : tableau vide (et non absent)", async () => {
    const fiche = await getFicheCopro("S024", "g1", TODAY);
    expect(fiche?.recapsAg).toEqual([]);
  });

  it("lecture des recaps en panne : la fiche s'ouvre, recapsAg absent", async () => {
    etat.recapsEnPanne = true;
    const fiche = await getFicheCopro("S024", "g1", TODAY);
    expect(fiche?.copro.code).toBe("S024");
    expect(fiche?.recapsAg).toBeUndefined();
  });
});

describe("getFicheCopro - fin du mandat de syndic (REA-249)", () => {
  const libelleMandat = (fiche: Awaited<ReturnType<typeof getFicheCopro>>) =>
    fiche?.conformite.find((c) => c.libelle.startsWith("Mandat de syndic"));

  it("mandat renouvele dans l'intranet : la fin du NOUVEAU cycle, pas celle du referentiel", async () => {
    etat.mandatSyndicFin = "2025-12-31";
    etat.contrats.S024 = { debutContrat: "2026-01-01", finContrat: "2026-12-31", enregistreLeISO: "2026-01-20" };
    const item = libelleMandat(await getFicheCopro("S024", "g1", TODAY));
    expect(item).toEqual({ libelle: "Mandat de syndic jusqu'au 31/12/2026", etat: "attention" });
  });

  it("aucun cycle enregistre : la date du referentiel, echue -> ko", async () => {
    etat.mandatSyndicFin = "2025-12-31";
    const item = libelleMandat(await getFicheCopro("S024", "g1", TODAY));
    expect(item).toEqual({ libelle: "Mandat de syndic jusqu'au 31/12/2025", etat: "ko" });
  });

  it("referentiel vide mais cycle enregistre : la ligne apparait", async () => {
    etat.contrats.S024 = { debutContrat: "2026-07-01", enregistreLeISO: "2026-07-10" };
    const item = libelleMandat(await getFicheCopro("S024", "g1", TODAY));
    expect(item?.libelle).toBe("Mandat de syndic jusqu'au 30/06/2027");
  });

  it("lecture des contrats en panne : la fiche s'ouvre sur la date du referentiel", async () => {
    etat.mandatSyndicFin = "2027-06-30";
    etat.contratsEnPanne = true;
    const fiche = await getFicheCopro("S024", "g1", TODAY);
    expect(libelleMandat(fiche)?.libelle).toBe("Mandat de syndic jusqu'au 30/06/2027");
  });
});

describe("getFicheCopro - conformite du module Contrats & controles (REA-333)", () => {
  const assurance = (fiche: Awaited<ReturnType<typeof getFicheCopro>>) => fiche?.conformite.find((c) => c.libelle.startsWith("Assurance"));
  const ctq = (fiche: Awaited<ReturnType<typeof getFicheCopro>>) => fiche?.conformite.find((c) => c.libelle.startsWith("Prochain CTQ"));

  it("courtier partenaire (graphie libre) : « suivie par le courtier » ok, meme avec une echeance passee", async () => {
    etat.courtier = "AREAS ";
    etat.assuranceEcheance = "2026-01-31";
    const item = assurance(await getFicheCopro("S024", "g1", TODAY));
    expect(item).toEqual({ libelle: "Assurance suivie par le courtier AREAS", etat: "ok" });
  });

  it("courtier hors partenaires : l'echeance du referentiel fait foi (passee -> ko)", async () => {
    etat.courtier = "Courtier du coin";
    etat.assuranceEcheance = "2026-01-31";
    const item = assurance(await getFicheCopro("S024", "g1", TODAY));
    expect(item).toEqual({ libelle: "Assurance jusqu'au 31/01/2026", etat: "ko" });
  });

  it("sans courtier ni echeance : aucune ligne assurance", async () => {
    expect(assurance(await getFicheCopro("S024", "g1", TODAY))).toBeUndefined();
  });

  it("prochain CTQ ascenseur : la plus proche echeance en cours, ko si passee", async () => {
    etat.cyclesCtq = [{ echeanceISO: "2027-03-01" }, { echeanceISO: "2026-06-30" }, { echeanceISO: null }];
    expect(ctq(await getFicheCopro("S024", "g1", TODAY))).toEqual({ libelle: "Prochain CTQ ascenseur le 30/06/2026", etat: "ko" });
  });

  it("prochain CTQ a moins de 120 jours : attention ; au-dela : ok", async () => {
    etat.cyclesCtq = [{ echeanceISO: "2026-10-01" }];
    expect(ctq(await getFicheCopro("S024", "g1", TODAY))?.etat).toBe("attention");
    etat.cyclesCtq = [{ echeanceISO: "2027-03-01" }];
    expect(ctq(await getFicheCopro("S024", "g1", TODAY))?.etat).toBe("ok");
  });

  it("un cycle clos ou sans echeance ne compte pas", async () => {
    etat.cyclesCtq = [{ echeanceISO: "2026-01-01", statut: "clos" }, { echeanceISO: null }];
    expect(ctq(await getFicheCopro("S024", "g1", TODAY))).toBeUndefined();
  });

  it("source des contrats en panne : la fiche s'ouvre, sans ces lignes, le reste intact", async () => {
    etat.contratsCoproEnPanne = true;
    etat.assuranceEcheance = "2027-01-31";
    etat.cyclesCtq = [{ echeanceISO: "2026-06-30" }];
    const fiche = await getFicheCopro("S024", "g1", TODAY);
    expect(fiche?.copro.code).toBe("S024");
    expect(assurance(fiche)).toEqual({ libelle: "Assurance jusqu'au 31/01/2027", etat: "ok" });
    expect(ctq(fiche)).toBeUndefined();
  });
});
