// Action « Reformuler » : session, module mail et interrupteur. Le routeur est doublé : le
// provider suit IA_REFORMULATION comme le vrai, sans réseau.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReformulationProvider } from "@/lib/ports/reformulation-provider";

const etat = vi.hoisted(() => ({
  session: { id: "g1", initiales: "SK", email: "sk@real31.fr" } as { id: string; initiales: string; email: string } | null,
  moduleOuvert: true,
  incarnation: false,
  appels: 0,
  lignes: [] as { incarnation: boolean }[],
}));

vi.mock("@/lib/auth/session", () => ({
  getGestionnaireCourant: async () => etat.session,
  incarnationEnCours: async () => etat.incarnation,
  mailModuleActifPour: () => etat.moduleOuvert,
}));
vi.mock("@/lib/observabilite", () => ({ tracer: vi.fn(), signaler: vi.fn(), signalerException: vi.fn() }));
vi.mock("@/lib/adapters/router", () => ({
  getReformulationProvider: (): ReformulationProvider | null =>
    process.env.IA_REFORMULATION === "on"
      ? {
          nom: "test",
          reformuler: async (d) => {
            etat.appels++;
            const brouillon = /<brouillon>\n([\s\S]*)\n<\/brouillon>/.exec(d.message)?.[1] ?? "";
            return { texte: brouillon.charAt(0).toUpperCase() + brouillon.slice(1), fin: "termine", tokensEntree: 10, tokensSortie: 10, modele: "claude-sonnet-5-5" };
          },
        }
      : null,
  getIaUsageRepository: () => ({
    enregistrer: async (l: { incarnation: boolean }) => void etat.lignes.push(l),
    compterDuJour: async () => 0,
  }),
}));

import { reformulerAction } from "./actions-reformulation";

const TEXTE = "bonjour, je vous confirme la visite de mardi pour la fuite";

beforeEach(() => {
  etat.session = { id: "g1", initiales: "SK", email: "sk@real31.fr" };
  etat.moduleOuvert = true;
  etat.incarnation = false;
  etat.appels = 0;
  etat.lignes.length = 0;
  vi.unstubAllEnvs();
  vi.stubEnv("IA_REFORMULATION", "on");
});

describe("reformulerAction", () => {
  it("rend le texte reformulé", async () => {
    expect(await reformulerAction({ texte: TEXTE, nature: "reponse", objet: "Re: Fuite" })).toEqual({
      ok: true,
      donnees: { texte: "Bonjour, je vous confirme la visite de mardi pour la fuite", inchange: false },
    });
  });

  it("interrupteur coupé : refus, aucun appel", async () => {
    vi.stubEnv("IA_REFORMULATION", "off");
    expect(await reformulerAction({ texte: TEXTE, nature: "reponse" })).toEqual({ ok: false, erreur: "La reformulation n'est pas activée." });
    expect(etat.appels).toBe(0);
  });

  it("non connecté ou module mail fermé : refus", async () => {
    etat.session = null;
    expect(await reformulerAction({ texte: TEXTE, nature: "nouveau" })).toEqual({ ok: false, erreur: "Non connecté." });
    etat.session = { id: "g1", initiales: "SK", email: "sk@real31.fr" };
    etat.moduleOuvert = false;
    expect((await reformulerAction({ texte: TEXTE, nature: "nouveau" })).ok).toBe(false);
    expect(etat.appels).toBe(0);
  });

  it("texte trop court ou trop long : refus lisible, aucun appel", async () => {
    expect(await reformulerAction({ texte: "ok merci", nature: "transfert" })).toEqual({ ok: false, erreur: "Le texte est trop court pour être reformulé." });
    expect(await reformulerAction({ texte: "a".repeat(7000), nature: "transfert" })).toEqual({ ok: false, erreur: expect.stringContaining("trop long") });
    expect(await reformulerAction({ texte: "a".repeat(20_000), nature: "transfert" })).toEqual({ ok: false, erreur: expect.stringContaining("trop long") });
    expect(etat.appels).toBe(0);
  });

  it("nature inconnue : refus (entrée validée)", async () => {
    expect((await reformulerAction({ texte: TEXTE, nature: "autre" as "reponse" })).ok).toBe(false);
  });

  it("autorisée en incarnation, notée au journal", async () => {
    etat.incarnation = true;
    expect((await reformulerAction({ texte: TEXTE, nature: "reponse" })).ok).toBe(true);
    expect(etat.lignes[0]?.incarnation).toBe(true);
  });
});
