import { beforeEach, describe, expect, it, vi } from "vitest";

// Le mail au comptable a l'enregistrement d'un recap (Sekou, 16/09/2026) : aux comptables
// de l'agence de la copro, copie au gestionnaire, tout le recap comme le mail MYTHEC,
// lien vers la file ; jamais bloquant.

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

import { corpsNotificationRecap, notifierRecapAg, sujetNotificationRecap } from "./notifier-recap";

const NB = " ";
const recap = {
  recapId: "r1",
  coproCode: "S191",
  assemblee: { jourDebut: "2026-03-12", heureDebut: 18, minuteDebut: 0, jourFin: "2026-03-12", heureFin: 20, minuteFin: 30 },
  boite: "wilfrid.tohoubi@real31.fr",
  par: "WT",
  depassementTtc: 80.23,
  comptesApprouves: true,
  budgetModifie: false,
  pourcentageBudget: 5,
  pptVote: false,
  fondsTravaux: true,
  travaux: [
    { libelle: "Reprise étanchéité APT 27", budget: 913.33, numeroResolution: "Résolution 15", cleRepartition: "Charges générales", modalitesAppelFonds: "100% fonds de travaux" },
    { libelle: "Traitement de bois", budget: 2500, numeroResolution: "Résolution 16", cleRepartition: "Charges générales", modalitesAppelFonds: "100 % fonds de travaux" },
  ],
  infoComptable: "Virement de 9900 à virer à M SALLA + d'info par mail SK",
  debutContrat: "2026-01-01",
  honorairesGestionTtc: 6722,
  fraisPostauxReels: false,
  forfaitPostauxTtc: 566,
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
    expect(m.boite).toBe("wilfrid.tohoubi@real31.fr");
    expect(m.cc).toEqual(["wilfrid.tohoubi@real31.fr"]);
    expect(m.sujet).toBe("S191 - Récap AG 12/03/2026");
    expect(m.corps).toContain("https://real31.app/comptabilite/recaps/r1");
    expect(etat.notifies).toEqual(["r1"]);
  });
  it("le corps reprend le mail MYTHEC champ par champ, travaux et contrat compris", () => {
    const c = corpsNotificationRecap(recap, "LES TILLEULS", "u");
    for (const attendu of [
      "Code entité copropriété : S191 - LES TILLEULS",
      "Date/Heure début AG : 12/03/2026 18:00",
      "Date/Heure fin AG : 12/03/2026 20:30",
      `Dépassement AG TTC : 80,23${NB}€`,
      "Comptes approuvés : Oui",
      "Le budget présenté a-t-il été modifié en AG ? : Non",
      "Montant du budget N+2 : ",
      "PPT voté à cette AG ? : Non",
      "Fonds travaux : Oui",
      "Pourcentage budget : 5 %",
      "Y a-t-il eu des travaux votés ? : Oui",
      "Travaux : Reprise étanchéité APT 27",
      `  Budget : 913,33${NB}€`,
      "  Résolution et clé de répartition : Résolution 15 // Charges générales",
      "  Modalités d'appel de fonds : 100% fonds de travaux",
      "Travaux : Traitement de bois",
      "Autres informations utiles pour le comptable : Virement de 9900 à virer à M SALLA + d'info par mail SK",
      "Informations nouveau contrat",
      `Honoraires de gestion courante (TTC) : 6${NB}722,00${NB}€`,
      `Frais postaux : 566,00${NB}€`,
      "Date de début de contrat : 01/01/2026",
    ]) {
      expect(c, attendu).toContain(attendu);
    }
  });
  it("sans travaux ni contrat : « Non », pas de bloc contrat, frais au reel dits", () => {
    const c = corpsNotificationRecap({ ...recap, travaux: [], debutContrat: undefined, honorairesGestionTtc: undefined }, "X", "u");
    expect(c).toContain("Y a-t-il eu des travaux votés ? : Non");
    expect(c).not.toContain("Informations nouveau contrat");
    expect(corpsNotificationRecap({ ...recap, fraisPostauxReels: true }, "X", "u")).toContain("Frais postaux : au réel");
    expect(sujetNotificationRecap(recap)).toBe("S191 - Récap AG 12/03/2026");
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
});
