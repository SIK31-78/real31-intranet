// Tests des actions du pole compta : ouverture au role COMPTABLE (allowlist COMPTABLES /
// SUPER_ADMINS -> ecrit sur N'IMPORTE quelle copro, le dialogue compta est prevu pour lui)
// SANS casser le cloisonnement gestionnaire (hors perimetre -> refus propre). La session
// et le service sont mockes ; le role est le vrai module (env stubee).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => {
  const ref = {
    session: { id: "g1", email: "remi@real31.fr", initiales: "RL" } as {
      id: string;
      email: string;
      initiales: string;
    } | null,
    // getCoproCompta : la copro appartient-elle au compte connecte ? (null = hors scope)
    coproDuCompte: null as Record<string, unknown> | null,
    appels: [] as { fn: string; options?: { transverse?: boolean } }[],
    reset() {
      ref.session = { id: "g1", email: "remi@real31.fr", initiales: "RL" };
      ref.coproDuCompte = null;
      ref.appels.length = 0;
    },
  };
  return ref;
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getGestionnaireCourant: async () => etat.session,
}));
vi.mock("@/lib/services/compta/get-compta", () => ({
  getCoproCompta: async () => etat.coproDuCompte,
  ajouterNoteCompta: async (
    _c: string,
    _d: string,
    _a: string,
    _t: string,
    _p: string,
    _m: string,
    options?: { transverse?: boolean },
  ) => {
    etat.appels.push({ fn: "ajouterNote", options });
  },
  marquerNoteCompta: async (
    _c: string,
    _d: string,
    _n: string,
    _r: boolean,
    _p: string,
    _m: string,
    options?: { transverse?: boolean },
  ) => {
    etat.appels.push({ fn: "marquerNote", options });
  },
  setFlagCompta: async (
    _c: string,
    _d: string,
    _f: string,
    _v: boolean,
    _p: string,
    _m: string,
    options?: { transverse?: boolean },
  ) => {
    etat.appels.push({ fn: "setFlag", options });
  },
}));

import { ajouterNoteAction, marquerNoteAction, setFlagAction } from "@/app/compta/actions";

beforeEach(() => {
  etat.reset();
  vi.stubEnv("COMPTABLES", "elsa@real31.fr");
  vi.stubEnv("SUPER_ADMINS", "sekou@real31.fr");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("actions compta ouvertes au role comptable (toute copro)", () => {
  beforeEach(() => {
    etat.session = { id: "c1", email: "elsa@real31.fr", initiales: "EL" };
    etat.coproDuCompte = null; // la copro n'est PAS dans son portefeuille : peu importe
  });

  it("ajouterNoteAction : la comptable poste une note sur n'importe quelle copro", async () => {
    const r = await ajouterNoteAction("S024", "2026-09-15", "comptable", "Comptes à jour ?");
    expect(r).toEqual({ ok: true });
    expect(etat.appels).toEqual([{ fn: "ajouterNote", options: { transverse: true } }]);
  });

  it("marquerNoteAction : la comptable marque une note traitee", async () => {
    const r = await marquerNoteAction("S024", "2026-09-15", "note-1", true);
    expect(r).toEqual({ ok: true });
    expect(etat.appels).toEqual([{ fn: "marquerNote", options: { transverse: true } }]);
  });

  it("setFlagAction : la comptable pose 'comptes verifies'", async () => {
    const r = await setFlagAction("S024", "2026-09-15", "verifies", true);
    expect(r).toEqual({ ok: true });
    expect(etat.appels).toEqual([{ fn: "setFlag", options: { transverse: true } }]);
  });

  it("un super-admin (test) passe aussi en transverse", async () => {
    etat.session = { id: "sa", email: "sekou@real31.fr", initiales: "SK" };
    const r = await setFlagAction("S024", "2026-09-15", "verifies", true);
    expect(r).toEqual({ ok: true });
    expect(etat.appels[0]?.options).toEqual({ transverse: true });
  });
});

describe("cloisonnement gestionnaire inchange", () => {
  it("gestionnaire HORS perimetre -> refus propre, aucune ecriture", async () => {
    etat.session = { id: "g9", email: "autre@real31.fr", initiales: "AU" };
    etat.coproDuCompte = null; // copro pas a lui
    const r = await ajouterNoteAction("S024", "2026-09-15", "gestionnaire", "Réponse");
    expect(r).toEqual({ ok: false, erreur: "Copropriété hors de votre périmètre." });
    expect(etat.appels).toHaveLength(0);
  });

  it("gestionnaire DE la copro -> ok, sans transverse (cloisonnement service conserve)", async () => {
    etat.coproDuCompte = { code: "S024" }; // copro de son portefeuille
    const r = await ajouterNoteAction("S024", "2026-09-15", "gestionnaire", "Réponse");
    expect(r).toEqual({ ok: true });
    expect(etat.appels).toEqual([{ fn: "ajouterNote", options: { transverse: false } }]);
  });

  it("session expiree -> refus propre", async () => {
    etat.session = null;
    const r = await setFlagAction("S024", "2026-09-15", "verifies", true);
    expect(r).toEqual({ ok: false, erreur: "Session expirée." });
  });
});
