// « Pour BPO » (02/11/2026) : le mail doit être dans mes boîtes (boîte partagée : distribué à
// mon binôme) ; les initiales et l'agence viennent de la session ; pas de dépôt en incarnation.

import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({
  session: { id: "g1", email: "julie@real31.fr", initiales: "JB", agencyId: "a-lgc" } as Record<string, string> | null,
  incarnation: false,
  // Les mails que boiteDuMail laisse passer : emailId -> boîte.
  mails: new Map<string, string>([["<moi@x>", "syndic2@real31.fr"]]),
}));
const services = vi.hoisted(() => ({
  cibleBpo: vi.fn(async () => ({ ok: true, cible: { dossier: "Compta/LGC/2026/11-novembre/04-11" } })),
  deposerPourBpo: vi.fn(async () => ({ ok: true, dossier: "Compta/LGC/2026/11-novembre/04-11/JB", pieces: [] })),
}));

vi.mock("@/lib/auth/session", () => ({
  getGestionnaireCourant: async () => etat.session,
  mailModuleActifPour: () => true,
  incarnationEnCours: async () => etat.incarnation,
}));
vi.mock("@/lib/observabilite", () => ({ tracer: vi.fn(), signaler: vi.fn(), signalerException: vi.fn() }));
vi.mock("./gardes-boites", () => ({
  boiteDuMail: async (_g: unknown, boite: string, emailId: string) => (etat.mails.get(emailId) === boite ? boite : null),
}));
vi.mock("@/lib/services/agences/resoudre-agence", () => ({ codeAgence: async () => "LGC" }));
vi.mock("@/lib/services/mes-emails/depot-bpo", () => services);

import { cibleBpoAction, deposerBpoAction } from "./actions-bpo";

const depot = { boite: "syndic2@real31.fr", emailId: "<moi@x>", coproCode: "S247", pjIds: ["AAMk="], sousDossier: "JB" };

beforeEach(() => {
  etat.session = { id: "g1", email: "julie@real31.fr", initiales: "JB", agencyId: "a-lgc" };
  etat.incarnation = false;
  vi.clearAllMocks();
});

describe("actions « Pour BPO »", () => {
  it("dépose pour un mail de mes boîtes, initiales et agence de la session", async () => {
    expect(await deposerBpoAction({ ...depot, initiales: "XX" })).toMatchObject({ ok: true });
    expect(services.deposerPourBpo).toHaveBeenCalledWith(
      expect.objectContaining({ boite: "syndic2@real31.fr", internetMessageId: "<moi@x>", initiales: "JB", agencePersonne: "LGC", sousDossier: "JB", confirmeEstale: false }),
    );
    expect(await cibleBpoAction({ boite: "syndic2@real31.fr", emailId: "<moi@x>", coproCode: "S247" })).toMatchObject({ ok: true });
  });

  it("refuse le mail d'un autre binôme (ou d'une autre personne) sans rien lire ni déposer", async () => {
    const autre = { ...depot, emailId: "<autre-binome@x>" };
    expect(await deposerBpoAction(autre)).toEqual({ ok: false, erreur: "Ce mail n'est pas dans tes boîtes." });
    expect(await cibleBpoAction({ boite: autre.boite, emailId: autre.emailId, coproCode: "S247" })).toEqual({ ok: false, erreur: "Ce mail n'est pas dans tes boîtes." });
    expect(await deposerBpoAction({ ...depot, boite: "marc@real31.fr" })).toMatchObject({ ok: false });
    expect(services.deposerPourBpo).not.toHaveBeenCalled();
    expect(services.cibleBpo).not.toHaveBeenCalled();
  });

  it("refuse en incarnation, sans session, et un id de pièce qui n'en est pas un", async () => {
    etat.incarnation = true;
    expect(await deposerBpoAction(depot)).toMatchObject({ ok: false });
    etat.incarnation = false;
    expect(await deposerBpoAction({ ...depot, pjIds: ["../../x?y"] })).toMatchObject({ ok: false });
    etat.session = null;
    expect(await deposerBpoAction(depot)).toMatchObject({ ok: false });
    expect(services.deposerPourBpo).not.toHaveBeenCalled();
  });
});
