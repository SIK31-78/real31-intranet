// Tests de la projection Outlook des dates CS/AG (increment 1bis). La date
// structuree de l'intranet reste LA source ; on verifie que l'agenda Outlook
// recoit le bon reflet (POST a la pose, PATCH a la re-pose / confirmation,
// DELETE a l'effacement) et que Graph en echec ne bloque JAMAIS l'intranet.
// Le routeur est mocke : faux repo confirmation (en memoire), faux referentiel
// copro, faux provider calendrier qui enregistre les appels.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmationEvenement } from "@/lib/domain/confirmation-evenement";
import { titreProjectionOutlook } from "@/lib/domain/confirmation-evenement";
import type { Copropriete } from "@/lib/domain/copropriete";

// --- Etat partage des fakes (hoiste car vi.mock est hoiste par vitest) ----------
const etat = vi.hoisted(() => {
  const confirmations = new Map<string, Record<string, unknown>>();
  const appels = {
    creer: [] as { boite: string; sujet: string; debut: string }[],
    patch: [] as { boite: string; eventId: string; titre?: string; date?: string }[],
    suppr: [] as { boite: string; eventId: string }[],
    setDate: [] as unknown[],
  };
  const cle = (c: string, t: string) => `${c}__${t}`;
  const ref = {
    confirmations,
    appels,
    cle,
    // Dates du referentiel copro (relues par confirmerEvenement cote serveur).
    datesCopro: { ag: undefined as string | undefined, cs: undefined as string | undefined },
    // Simule un Graph en panne (403 Access Policy, timeout...) : tout appel throw.
    graphEnPanne: false,
    reset() {
      confirmations.clear();
      appels.creer.length = 0;
      appels.patch.length = 0;
      appels.suppr.length = 0;
      appels.setDate.length = 0;
      ref.datesCopro = { ag: undefined, cs: undefined };
      ref.graphEnPanne = false;
    },
  };
  return ref;
});

vi.mock("@/lib/adapters/router", () => ({
  getConfirmationEvenementRepository: () => ({
    async getPourCopros(codes: string[]) {
      return [...etat.confirmations.values()].filter((c) =>
        codes.includes(c.coproCode as string),
      );
    },
    async get(coproCode: string) {
      return [...etat.confirmations.values()].filter((c) => c.coproCode === coproCode);
    },
    async confirmer(coproCode: string, type: string, date: string, par: string) {
      const avant = etat.confirmations.get(etat.cle(coproCode, type));
      etat.confirmations.set(etat.cle(coproCode, type), {
        ...avant, // la projection Outlook survit (comme l'upsert SQL)
        coproCode,
        type,
        date,
        statut: "confirme",
        confirmePar: par,
      });
    },
    async proposer(coproCode: string, type: string, date: string) {
      const avant = etat.confirmations.get(etat.cle(coproCode, type));
      etat.confirmations.set(etat.cle(coproCode, type), {
        coproCode,
        type,
        date,
        statut: "a_confirmer",
        ...(avant?.outlookEventId
          ? { outlookEventId: avant.outlookEventId, outlookBoite: avant.outlookBoite }
          : {}),
      });
    },
    async enregistrerProjection(
      coproCode: string,
      type: string,
      eventId: string | null,
      boite: string | null,
    ) {
      const c = etat.confirmations.get(etat.cle(coproCode, type));
      if (!c) return;
      if (eventId && boite) {
        c.outlookEventId = eventId;
        c.outlookBoite = boite;
      } else {
        delete c.outlookEventId;
        delete c.outlookBoite;
      }
    },
  }),
  getCoproRepository: () => ({
    async findByCode(code: string) {
      return {
        code,
        ...(etat.datesCopro.ag ? { prochaineAg: { date: etat.datesCopro.ag } } : {}),
        ...(etat.datesCopro.cs ? { prochaineCsDate: etat.datesCopro.cs } : {}),
      } as unknown as Copropriete;
    },
    async setDateEvenement(...args: unknown[]) {
      etat.appels.setDate.push(args);
    },
    async list() {
      return [];
    },
  }),
  getCalendrierOutboundProvider: () => ({
    async creerEvenement(p: { boite: string; sujet: string; debut: string }) {
      if (etat.graphEnPanne) throw new Error("Graph creer evenement 403");
      etat.appels.creer.push(p);
      return { id: `evt-${etat.appels.creer.length}` };
    },
    async mettreAJourEvenement(
      boite: string,
      eventId: string,
      patch: { titre?: string; date?: string },
    ) {
      if (etat.graphEnPanne) throw new Error("Graph mettre a jour evenement 403");
      etat.appels.patch.push({ boite, eventId, ...patch });
    },
    async supprimerEvenement(boite: string, eventId: string) {
      if (etat.graphEnPanne) throw new Error("Graph supprimer evenement 403");
      etat.appels.suppr.push({ boite, eventId });
    },
  }),
}));

import { definirDateEvenement } from "@/lib/services/coproprietes/definir-date-evenement";
import { confirmerEvenement } from "@/lib/services/coproprietes/confirmation-evenement";
import {
  deprojeterEvenementOutlook,
  projeterEvenementOutlook,
} from "@/lib/services/coproprietes/projeter-evenement-outlook";

const BOITE = "remi@real31.fr";

function confirmation(code: string, type: string): ConfirmationEvenement | undefined {
  return etat.confirmations.get(etat.cle(code, type)) as ConfirmationEvenement | undefined;
}

beforeEach(() => {
  etat.reset();
});

describe("titreProjectionOutlook", () => {
  it("genere les titres avec les vrais accents (AG feminin, CS masculin)", () => {
    expect(titreProjectionOutlook("S024", "AG", "a_confirmer")).toBe("S024 : AG à confirmer");
    expect(titreProjectionOutlook("S024", "AG", "confirme")).toBe("S024 : AG confirmée");
    expect(titreProjectionOutlook("S024", "CS", "a_confirmer")).toBe("S024 : CS à confirmer");
    expect(titreProjectionOutlook("S024", "CS", "confirme")).toBe("S024 : CS confirmé");
  });
});

describe("pose d'une prochaine date (definirDateEvenement)", () => {
  it("cree l'evenement Outlook 'a confirmer' et memorise eventId + boite", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-15", "g1", BOITE);

    expect(etat.appels.creer).toHaveLength(1);
    expect(etat.appels.creer[0]).toMatchObject({
      boite: BOITE,
      sujet: "S024 : AG à confirmer",
      debut: "2026-09-15",
    });
    const c = confirmation("S024", "AG");
    expect(c?.statut).toBe("a_confirmer");
    expect(c?.outlookEventId).toBe("evt-1");
    expect(c?.outlookBoite).toBe(BOITE);
  });

  it("re-poser la date DEPLACE l'evenement existant (PATCH), sans 2e POST", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-15", "g1", BOITE);
    await definirDateEvenement("S024", "ag", "prochaine", "2026-10-01", "g1", BOITE);

    expect(etat.appels.creer).toHaveLength(1); // un seul POST, jamais de doublon
    expect(etat.appels.patch).toHaveLength(1);
    expect(etat.appels.patch[0]).toMatchObject({
      boite: BOITE,
      eventId: "evt-1",
      titre: "S024 : AG à confirmer", // le titre repasse / reste "a confirmer"
      date: "2026-10-01",
    });
    expect(confirmation("S024", "AG")?.outlookEventId).toBe("evt-1");
  });

  it("une date 'derniere' (correction du referentiel) ne projette rien", async () => {
    await definirDateEvenement("S024", "ag", "derniere", "2026-04-16", "g1", BOITE);
    expect(etat.appels.creer).toHaveLength(0);
    expect(etat.appels.patch).toHaveLength(0);
  });

  it("sans boite (email de session inconnu) et sans projection existante : pas d'appel Graph", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-15", "g1");
    expect(etat.appels.creer).toHaveLength(0);
    // le statut intranet est bien persiste malgre tout
    expect(confirmation("S024", "AG")?.statut).toBe("a_confirmer");
  });
});

describe("confirmation (confirmerEvenement)", () => {
  it("renomme l'evenement projete en 'confirmée' (PATCH titre)", async () => {
    etat.datesCopro.ag = "2026-09-15";
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-15", "g1", BOITE);
    const date = await confirmerEvenement("S024", "AG", "EL", "g1", BOITE);

    expect(date).toBe("2026-09-15");
    expect(confirmation("S024", "AG")?.statut).toBe("confirme");
    expect(etat.appels.creer).toHaveLength(1); // pas de 2e evenement
    expect(etat.appels.patch).toHaveLength(1);
    expect(etat.appels.patch[0]).toMatchObject({
      eventId: "evt-1",
      titre: "S024 : AG confirmée",
      date: "2026-09-15",
    });
  });

  it("sans projection existante, confirmer cree l'evenement directement 'confirmé' (CS)", async () => {
    etat.datesCopro.cs = "2026-11-05";
    await confirmerEvenement("S031", "CS", "EL", "g1", BOITE);

    expect(etat.appels.creer).toHaveLength(1);
    expect(etat.appels.creer[0]).toMatchObject({
      sujet: "S031 : CS confirmé",
      debut: "2026-11-05",
    });
  });
});

describe("effacement de la date (RAZ)", () => {
  it("supprime l'evenement Outlook et efface la projection en base", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-15", "g1", BOITE);
    await definirDateEvenement("S024", "ag", "prochaine", "", "g1", BOITE);

    expect(etat.appels.suppr).toHaveLength(1);
    expect(etat.appels.suppr[0]).toEqual({ boite: BOITE, eventId: "evt-1" });
    const c = confirmation("S024", "AG");
    expect(c?.outlookEventId).toBeUndefined();
    expect(c?.outlookBoite).toBeUndefined();
  });

  it("sans projection enregistree, effacer ne tente aucun DELETE", async () => {
    await deprojeterEvenementOutlook("S024", "AG");
    expect(etat.appels.suppr).toHaveLength(0);
  });
});

describe("degradation propre (Outlook ne bloque jamais l'intranet)", () => {
  it("Graph en echec a la pose : la date et le statut sont quand meme persistes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    etat.graphEnPanne = true;

    await expect(
      definirDateEvenement("S024", "ag", "prochaine", "2026-09-15", "g1", BOITE),
    ).resolves.toBeUndefined();

    const c = confirmation("S024", "AG");
    expect(c?.statut).toBe("a_confirmer");
    expect(c?.date).toBe("2026-09-15");
    expect(c?.outlookEventId).toBeUndefined(); // pas de projection fantome
    expect(warn).toHaveBeenCalled();
    // warn SANS PII : ni email, ni date - code copro + type seulement
    expect(String(warn.mock.calls[0]?.[0])).not.toContain(BOITE);
    warn.mockRestore();
  });

  it("Graph en echec a la confirmation : le statut confirme est quand meme persiste", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    etat.datesCopro.ag = "2026-09-15";
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-15", "g1", BOITE);
    etat.graphEnPanne = true;

    const date = await confirmerEvenement("S024", "AG", "EL", "g1", BOITE);

    expect(date).toBe("2026-09-15");
    expect(confirmation("S024", "AG")?.statut).toBe("confirme");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("Graph en echec a l'effacement : la projection reste memorisee (retentee au prochain geste)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-15", "g1", BOITE);
    etat.graphEnPanne = true;

    await expect(deprojeterEvenementOutlook("S024", "AG")).resolves.toBeUndefined();
    expect(confirmation("S024", "AG")?.outlookEventId).toBe("evt-1");
    warn.mockRestore();
  });

  it("projeter directement sans provider fonctionnel n'a jamais d'effet de bord bloquant", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    etat.graphEnPanne = true;
    await expect(
      projeterEvenementOutlook("S024", "AG", "2026-09-15", "a_confirmer", BOITE),
    ).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
