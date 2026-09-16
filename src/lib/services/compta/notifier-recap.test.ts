import { beforeEach, describe, expect, it, vi } from "vitest";

// Le mail au comptable a l'enregistrement d'un recap (Sekou, 16/09/2026) : aux comptables
// de l'agence de la copro, copie au gestionnaire, lien vers la file ; jamais bloquant.

const etat = vi.hoisted(() => ({
  agence: "ML" as string | undefined,
  envois: [] as { boite: string; a: string[]; cc: string[]; sujet: string; corps: string }[],
  notifies: [] as string[],
  panneMail: false,
}));

vi.mock("@/lib/observabilite", () => ({ signalerException: () => undefined }));
vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () => ({
    async findByCode(code: string) {
      return { code, nom: "LES TILLEULS", agenceId: "ag-ml" };
    },
  }),
  getAgenceRepository: () => ({
    async listerAgences() {
      return etat.agence ? [{ id: "ag-ml", code: etat.agence }] : [];
    },
  }),
  getMailOutboundProvider: () => ({
    async envoyerNeuf(p: (typeof etat.envois)[number]) {
      if (etat.panneMail) throw new Error("Graph HTTP 503");
      etat.envois.push(p);
    },
  }),
  getRecapAgRepository: () => ({
    async marquerNotifie(id: string) {
      etat.notifies.push(id);
    },
  }),
}));

import { corpsNotificationRecap, notifierRecapAg } from "./notifier-recap";

const recap = {
  recapId: "r1",
  coproCode: "S170",
  agDate: "2026-07-20",
  boite: "titouan.gaudin@real31.fr",
  par: "TG",
  comptesApprouves: true,
  budgetModifie: true,
  montantBudget: 48000,
  nbTravauxVotes: 2,
  depassementHeures: 0,
  infoComptable: "Appel travaux en 3 fois.",
};

beforeEach(() => {
  etat.agence = "ML";
  etat.envois = [];
  etat.notifies = [];
  etat.panneMail = false;
  vi.stubEnv("AUTH_URL", "https://real31.app/");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("notifierRecapAg", () => {
  it("envoie aux comptables de l'agence, copie au gestionnaire, et marque le recap notifie", async () => {
    const r = await notifierRecapAg(recap);
    expect(r).toEqual({ envoye: true, a: ["isabelle.anglade@real31.fr"] });
    const m = etat.envois[0]!;
    expect(m.boite).toBe("titouan.gaudin@real31.fr");
    expect(m.cc).toEqual(["titouan.gaudin@real31.fr"]);
    expect(m.sujet).toBe("Récap AG S170 – LES TILLEULS – AG du 20/07/2026");
    expect(m.corps).toContain("https://real31.app/comptabilite/recaps/r1");
    expect(m.corps).toContain("2 travaux votés");
    expect(m.corps).toContain("Note du gestionnaire : Appel travaux en 3 fois.");
    expect(etat.notifies).toEqual(["r1"]);
  });
  it("LGC : les deux comptables du pole ; sans agence resolue : personne, et on le dit", async () => {
    etat.agence = "LGC";
    expect((await notifierRecapAg(recap)).a.sort()).toEqual(["elsa.peixoto@real31.fr", "romain.gobert@real31.fr"]);
    etat.agence = undefined;
    expect(await notifierRecapAg(recap)).toEqual({ envoye: false, a: [] });
  });
  it("sans boite d'envoi (mock) ou Graph en panne : rien ne casse, rien n'est marque", async () => {
    expect(await notifierRecapAg({ ...recap, boite: undefined })).toEqual({ envoye: false, a: [] });
    etat.panneMail = true;
    expect(await notifierRecapAg(recap)).toEqual({ envoye: false, a: [] });
    expect(etat.notifies).toEqual([]);
  });
  it("le corps reste lisible quand rien n'a ete vote", () => {
    const c = corpsNotificationRecap({ ...recap, budgetModifie: false, nbTravauxVotes: 0, infoComptable: undefined, montantBudget: undefined }, "X", "https://x/y");
    expect(c).toContain("• Budget inchangé");
    expect(c).toContain("• Aucuns travaux votés");
    expect(c).not.toContain("Note du gestionnaire");
  });
});
