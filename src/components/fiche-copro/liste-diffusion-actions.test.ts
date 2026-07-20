// Tests de l'action enregistrerListeSecoursCSAction : validation zod, session,
// anti-IDOR (cloisonnement gestionnaire), et nettoyage par le DOMAINE avant persistance
// (dedup insensible casse + exclusion des internes @real31.fr + rejet des mal formees).
// Session, cloisonnement et router sont mockes ; le domaine listes-diffusion est REEL
// (on verifie qu'il est bien reutilise). Adresses inventees @example.test : aucune PII.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({
  session: { id: "g1", email: "remi@real31.fr" } as { id: string; email: string } | null,
  appartient: true,
  remplaceAppels: [] as { coproCode: string; emails: string[] }[],
  reset() {
    etat.session = { id: "g1", email: "remi@real31.fr" };
    etat.appartient = true;
    etat.remplaceAppels = [];
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getGestionnaireCourant: async () => etat.session,
}));
vi.mock("@/lib/services/coproprietes/copro-appartient", () => ({
  coproAppartient: async () => etat.appartient,
}));
vi.mock("@/lib/adapters/router", () => ({
  getListesDiffusionProvider: () => ({
    async remplacerListeCS(coproCode: string, emails: string[]) {
      etat.remplaceAppels.push({ coproCode, emails });
    },
  }),
}));

import { enregistrerListeSecoursCSAction } from "./liste-diffusion-actions";

beforeEach(() => etat.reset());
afterEach(() => vi.unstubAllEnvs());

describe("enregistrerListeSecoursCSAction", () => {
  it("zod : code vide -> {ok:false}, aucune ecriture", async () => {
    const r = await enregistrerListeSecoursCSAction("", ["m1@example.test"]);
    expect(r).toEqual({ ok: false, message: "Données invalides." });
    expect(etat.remplaceAppels).toHaveLength(0);
  });

  it("zod : trop de destinataires (>50) -> {ok:false}, aucune ecriture", async () => {
    const trop = Array.from({ length: 51 }, (_, i) => `m${i}@example.test`);
    const r = await enregistrerListeSecoursCSAction("S46", trop);
    expect(r).toEqual({ ok: false, message: "Données invalides." });
    expect(etat.remplaceAppels).toHaveLength(0);
  });

  it("session expiree -> refus propre", async () => {
    etat.session = null;
    const r = await enregistrerListeSecoursCSAction("S46", ["m1@example.test"]);
    expect(r).toEqual({ ok: false, message: "Session expirée, reconnectez-vous." });
    expect(etat.remplaceAppels).toHaveLength(0);
  });

  it("anti-IDOR : copro hors perimetre (COPRO_SOURCE=supabase) -> refus, aucune ecriture", async () => {
    vi.stubEnv("COPRO_SOURCE", "supabase");
    etat.appartient = false;
    const r = await enregistrerListeSecoursCSAction("S46", ["m1@example.test"]);
    expect(r).toEqual({ ok: false, message: "Copropriété hors de votre périmètre." });
    expect(etat.remplaceAppels).toHaveLength(0);
  });

  it("dedup + exclusion internes + rejet mal formees via le domaine, avant persistance", async () => {
    const r = await enregistrerListeSecoursCSAction("S46", [
      "pres@example.test",
      "PRES@example.test", // doublon (casse)
      "gestionnaire@real31.fr", // interne -> exclu
      "pasunemail", // mal formee -> exclue
      "membre@example.test",
    ]);
    expect(r).toEqual({ ok: true, emails: ["pres@example.test", "membre@example.test"] });
    expect(etat.remplaceAppels).toHaveLength(1);
    expect(etat.remplaceAppels[0].emails).toEqual(["pres@example.test", "membre@example.test"]);
  });

  it("persistance indisponible (adapter throw) -> message propre, pas de crash", async () => {
    const espion = vi
      .spyOn(await import("@/lib/adapters/router"), "getListesDiffusionProvider")
      .mockReturnValue({
        listeCSPourCopro: async () => null,
        remplacerListeCS: async () => {
          throw new Error("schema pas a jour");
        },
      });
    const r = await enregistrerListeSecoursCSAction("S46", ["m1@example.test"]);
    expect(r.ok).toBe(false);
    espion.mockRestore();
  });
});
