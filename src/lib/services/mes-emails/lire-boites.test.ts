// Le « lu » de l'écran E-mails vient d'Outlook (REA-422, 27/10/2026) : lu par une lecture
// légère à côté de l'ingestion, sur la boîte perso (les plus récents) comme sur la boîte
// partagée (les mails distribués). Une panne de cette lecture ne casse pas l'écran.
// Ingestion, boîte aux lettres et distribution simulées, zéro réseau.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";
import type { BoiteMail } from "@/lib/domain/boites-mail";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";

const etat = vi.hoisted(() => ({
  bruts: new Map<string, RawMail[]>(),
  lus: new Map<string, Map<string, boolean>>(),
  demandes: [] as unknown[],
  panneLu: false,
}));

vi.mock("@/lib/adapters/router", () => ({
  getMailIngestionProvider: () => ({
    lireRecents: async (o: { email: string }) => etat.bruts.get(o.email) ?? [],
    lireParIds: async (email: string, ids: string[]) => (etat.bruts.get(email) ?? []).filter((m) => ids.includes(m.internetMessageId)),
  }),
  getMailboxProvider: () => ({
    lireEtatsLu: async (p: { boite: string }) => {
      etat.demandes.push(p);
      if (etat.panneLu) throw new Error("Graph 503");
      return etat.lus.get(p.boite) ?? new Map();
    },
  }),
  // Référentiel indisponible : la copro n'est pas déduite, ce n'est pas le sujet ici.
  getReferentielTriProvider: () => ({ charger: async () => Promise.reject(new Error("hors sujet")) }),
}));
vi.mock("@/lib/services/tri-emails/acces", () => ({ boiteDe: async () => null }));
vi.mock("./boites-visibles", () => ({
  distributionDe: async () => new Map([["<p1>", "S0297"]]),
  mailsParDelegation: async () => new Map(),
}));
vi.mock("@/lib/observabilite", () => ({ signalerException: () => undefined }));

const { lireBoitesLive } = await import("./lire-boites");

const PERSO = "moi@real31.fr";
const SYNDIC4 = "syndic4@real31.fr";
const boites: BoiteMail[] = [
  { id: PERSO, adresse: PERSO, libelle: "Ma boîte", personnelle: true },
  { id: SYNDIC4, adresse: SYNDIC4, libelle: "syndic4", personnelle: false },
];
const g = { id: "u1", email: PERSO, nomComplet: "Moi", initiales: "MO" } as Gestionnaire;

const brut = (id: string): RawMail => ({
  id: `graph-${id}`,
  internetMessageId: id,
  from: "client@exemple.fr",
  to: [],
  subject: `Objet ${id}`,
  receivedAt: "2099-10-27T08:00:00Z",
  bodyText: "Bonjour",
  copro: "",
  attachments: [],
});

beforeEach(() => {
  etat.bruts = new Map([
    [PERSO, [brut("<a>"), brut("<b>")]],
    [SYNDIC4, [brut("<p1>")]],
  ]);
  etat.lus = new Map([
    [PERSO, new Map([["<a>", true]])],
    [SYNDIC4, new Map([["<p1>", true]])],
  ]);
  etat.demandes = [];
  etat.panneLu = false;
});

describe("lireBoitesLive : le lu d'Outlook", () => {
  it("pose le lu d'Outlook sur chaque carte, boîte perso et boîte partagée", async () => {
    const { mails } = await lireBoitesLive(g, boites, []);
    const lu = Object.fromEntries(mails.map((m) => [m.id, m.lu]));
    expect(lu).toEqual({ "<a>": true, "<b>": false, "<p1>": true });
    // Perso : la fenêtre des plus récents, avec une marge ; partagée : les mails distribués.
    expect(etat.demandes).toEqual([
      { boite: PERSO, recents: 50 },
      { boite: SYNDIC4, internetMessageIds: ["<p1>"] },
    ]);
  });

  it("une panne de la lecture du lu laisse les mails non lus, sans faire tomber la boîte", async () => {
    etat.panneLu = true;
    const r = await lireBoitesLive(g, boites, []);
    expect(r.erreurs).toEqual([]);
    expect(r.mails.map((m) => m.lu)).toEqual([false, false, false]);
  });
});
