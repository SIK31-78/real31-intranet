// Actions de la boîte d'équipe : gardes de « Pas pour moi », acteur tiré de la session, notes
// refusées en incarnation. Gardes et service doublés.

import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({
  session: { id: "g1", email: "fanny.s@real31.fr", nomComplet: "Fanny S.", initiales: "FS" } as Record<string, string> | null,
  partagee: "syndic4@real31.fr" as string | null,
  duMail: "syndic4@real31.fr" as string | null,
  incarnation: false,
}));
const service = vi.hoisted(() => ({
  prendreMail: vi.fn(async () => ({ email: "fanny.s@real31.fr", nomComplet: "Fanny S.", initiales: "FS" })),
  ajouterNoteMail: vi.fn(async () => ({ id: "n1" })),
  mettreEnAttente: vi.fn(async () => null),
  etatEquipeDesMails: vi.fn(async () => ({ actif: true, parMail: new Map() })),
}));

vi.mock("@/lib/auth/session", () => ({ getGestionnaireCourant: async () => etat.session, incarnationEnCours: async () => etat.incarnation }));
vi.mock("@/lib/auth/roles", () => ({ estSuperAdmin: () => false }));
vi.mock("@/lib/observabilite", () => ({ tracer: vi.fn(), signaler: vi.fn(), signalerException: vi.fn() }));
vi.mock("@/lib/services/mes-emails/compteur-emails", () => ({ oublierCompteurEmails: vi.fn() }));
vi.mock("@/lib/services/mes-emails/boites-visibles", () => ({ conversationsDistribuees: async () => new Set() }));
vi.mock("@/lib/services/mes-emails/boite-equipe", () => service);
vi.mock("./gardes-boites", () => ({
  boitePartageeDe: async () => etat.partagee,
  boiteDuMail: async () => etat.duMail,
  boiteCible: async () => etat.duMail,
  natureBoite: async () => "partagee",
  boitesDe: async () => [{ id: "syndic4@real31.fr", personnelle: false }],
}));

import { ajouterNoteAction, etatEquipeAction, mettreEnAttenteAction, prendreMailAction } from "./actions-equipe";

beforeEach(() => {
  etat.session = { id: "g1", email: "fanny.s@real31.fr", nomComplet: "Fanny S.", initiales: "FS" };
  etat.partagee = "syndic4@real31.fr";
  etat.duMail = "syndic4@real31.fr";
  etat.incarnation = false;
  vi.clearAllMocks();
});

describe("actions de la boîte d'équipe", () => {
  it("« Je prends » : l'acteur est la session, la boîte celle de la garde", async () => {
    expect((await prendreMailAction("<m1@x>", "Syndic4@real31.fr")).ok).toBe(true);
    expect(service.prendreMail).toHaveBeenCalledWith(etat.session, "syndic4@real31.fr", "<m1@x>");
  });

  it("refus : pas connecté, ou mail d'un autre binôme", async () => {
    etat.partagee = null;
    expect(await prendreMailAction("<m1@x>", "syndic4@real31.fr")).toMatchObject({ ok: false });
    etat.session = null;
    expect(await prendreMailAction("<m1@x>", "syndic4@real31.fr")).toEqual({ ok: false, erreur: "Non connecté." });
    expect(service.prendreMail).not.toHaveBeenCalled();
  });

  it("pas de note en incarnation", async () => {
    etat.incarnation = true;
    expect(await ajouterNoteAction("<m1@x>", "syndic4@real31.fr", "texte")).toMatchObject({ ok: false });
    expect(service.ajouterNoteMail).not.toHaveBeenCalled();
  });

  it("en attente : choix validé (de côté accepté, n'importe quoi refusé)", async () => {
    expect((await mettreEnAttenteAction("<m1@x>", "syndic4@real31.fr", "de-cote")).ok).toBe(true);
    expect(await mettreEnAttenteAction("<m1@x>", "syndic4@real31.fr", "dans-un-mois")).toEqual({ ok: false, erreur: "Données invalides." });
  });

  it("état agrégé : les mails non distribués sont écartés", async () => {
    etat.partagee = null;
    await etatEquipeAction([{ emailId: "<m1@x>", boite: "syndic4@real31.fr" }]);
    expect(service.etatEquipeDesMails).toHaveBeenCalledWith([], { lecteur: etat.session });
  });
});
