// « Relancer si pas de réponse » choisi dans la réponse (02/11/2026) : posé seulement après
// un envoi réussi, sur les identifiants scellés dans le jeton (jamais venus du navigateur), dans
// la boîte qui a expédié. Jeton, envoi et services doublés.

import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({
  session: { id: "g1", email: "oceane@real31.fr", nomComplet: "Océane", initiales: "OC" } as Record<string, string> | null,
  jeton: null as Record<string, unknown> | null,
  envoiEchoue: false,
}));
const services = vi.hoisted(() => ({
  envoyerBrouillonPrepare: vi.fn(async () => {
    if (etat.envoiEchoue) throw new Error("Graph send 500");
  }),
  relancerApresEnvoi: vi.fn(async () => ({ jusquAu: "2026-11-05T07:00:00.000Z" })),
  attribuerAuRepondant: vi.fn(async () => undefined),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getGestionnaireCourant: async () => etat.session,
  mailModuleActifPour: () => true,
  incarnationEnCours: async () => false,
}));
vi.mock("@/lib/auth/roles", () => ({ estSuperAdmin: () => false }));
vi.mock("@/lib/observabilite", () => ({ tracer: vi.fn(), signaler: vi.fn(), signalerException: vi.fn() }));
vi.mock("./gardes-boites", () => ({
  boiteCible: async () => null,
  boiteDuMail: async () => null,
  boitePartageeDe: async () => null,
  natureBoite: async () => null,
  boitesDe: async () => [],
}));
vi.mock("@/lib/services/mes-emails/depot-piece-jointe", () => ({
  brouillonDe: (_j: string, gid: string) => (etat.jeton && etat.jeton.gid === gid ? etat.jeton : null),
  envoyerBrouillonPrepare: services.envoyerBrouillonPrepare,
  abandonnerBrouillonPrepare: vi.fn(),
}));
vi.mock("@/lib/services/mes-emails/boite-equipe", () => ({
  attribuerAuRepondant: services.attribuerAuRepondant,
  relancerApresEnvoi: services.relancerApresEnvoi,
}));
vi.mock("@/lib/services/mes-emails/maj-etat", () => ({
  enregistrerStatut: vi.fn(async () => undefined),
  enregistrerBrouillon: vi.fn(),
  enregistrerCopro: vi.fn(),
  enregistrerDossier: vi.fn(),
  enregistrerLu: vi.fn(),
  enregistrerRattachement: vi.fn(),
  marquerLuDansOutlook: vi.fn(),
}));

import { finaliserEnvoiAction } from "./actions";

const jetonEnvoi = (mode: "envoyer" | "brouillon") => ({
  nature: "brouillon",
  boite: "syndic2@real31.fr",
  draftId: "d1",
  gid: "g1",
  mode,
  emailId: "<recu@x>",
  coproCode: "S247",
  boiteMessage: "syndic2@real31.fr",
  reponse: { internetMessageId: "<reponse@real31.fr>", conversationId: "conv-1" },
  exp: Date.now() + 60_000,
});

beforeEach(() => {
  etat.session = { id: "g1", email: "oceane@real31.fr", nomComplet: "Océane", initiales: "OC" };
  etat.jeton = jetonEnvoi("envoyer");
  etat.envoiEchoue = false;
  vi.clearAllMocks();
});

describe("finaliserEnvoiAction : relance posée à l'envoi", () => {
  it("après l'envoi : relance sur les identifiants du jeton, dans la boîte d'envoi", async () => {
    const r = await finaliserEnvoiAction({ jeton: "x", relance: "semaine", internetMessageId: "<forge@x>" });
    expect(r).toEqual({ ok: true, envoye: true, relance: { jusquAu: "2026-11-05T07:00:00.000Z" } });
    expect(services.relancerApresEnvoi).toHaveBeenCalledWith(etat.session, {
      boite: "syndic2@real31.fr",
      internetMessageId: "<reponse@real31.fr>",
      conversationId: "conv-1",
      choix: "semaine",
    });
  });

  it("sans choix : pas de relance", async () => {
    expect(await finaliserEnvoiAction({ jeton: "x" })).toEqual({ ok: true, envoye: true });
    expect(services.relancerApresEnvoi).not.toHaveBeenCalled();
  });

  it("brouillon Outlook, envoi raté, jeton d'une autre personne ou choix invalide : aucune relance", async () => {
    etat.jeton = jetonEnvoi("brouillon");
    expect(await finaliserEnvoiAction({ jeton: "x", relance: "demain" })).toEqual({ ok: true, envoye: false });
    etat.jeton = jetonEnvoi("envoyer");
    etat.envoiEchoue = true;
    expect(await finaliserEnvoiAction({ jeton: "x", relance: "demain" })).toMatchObject({ ok: false });
    etat.envoiEchoue = false;
    etat.session = { id: "autre", email: "autre@real31.fr", nomComplet: "Autre", initiales: "AU" };
    expect(await finaliserEnvoiAction({ jeton: "x", relance: "demain" })).toMatchObject({ ok: false });
    expect(await finaliserEnvoiAction({ jeton: "x", relance: "dans-un-mois" })).toEqual({ ok: false, message: "Données invalides." });
    expect(services.relancerApresEnvoi).not.toHaveBeenCalled();
  });
});

// « Répondre depuis Échanges » (02/11/2026) : la réponse à un mail non distribué part, sans
// attribution ni statut en base (réservés aux mails distribués).
describe("finaliserEnvoiAction : mail ouvert depuis Échanges hors distribution", () => {
  it("la réponse part, sans attribution", async () => {
    etat.jeton = { ...jetonEnvoi("envoyer"), horsDistribution: true };
    expect(await finaliserEnvoiAction({ jeton: "x" })).toEqual({ ok: true, envoye: true });
    expect(services.envoyerBrouillonPrepare).toHaveBeenCalled();
    expect(services.attribuerAuRepondant).not.toHaveBeenCalled();
  });

  it("un mail distribué : attribué à celui qui répond, comme avant", async () => {
    await finaliserEnvoiAction({ jeton: "x" });
    expect(services.attribuerAuRepondant).toHaveBeenCalled();
  });
});
