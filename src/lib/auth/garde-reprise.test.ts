// Tests de la GARDE SERVEUR du module reprise (defense en profondeur) : session mockee,
// role = le VRAI module roles.ts (env stubee). C'est ce garde qui protege les Server Actions et
// les routes du module - le grisage cote UI ne protege rien.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({
  session: null as { id: string; email?: string; initiales: string } | null,
}));

vi.mock("@/lib/auth/session", () => ({
  getGestionnaireCourant: async () => etat.session,
}));

import { exigerAdminReprise } from "./garde-reprise";

beforeEach(() => {
  etat.session = { id: "g1", email: "gestionnaire@real31.fr", initiales: "GG" };
  for (const v of ["MANAGERS", "MANAGER", "DIRECTEURS", "DIRECTEUR", "SUPER_ADMINS", "SUPER_ADMIN"]) {
    vi.stubEnv(v, "");
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("exigerAdminReprise", () => {
  it("pas de session -> 401 avec un message de reconnexion contextualise", async () => {
    etat.session = null;
    const r = await exigerAdminReprise("lancer l'analyse");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.statut).toBe(401);
      expect(r.message).toContain("lancer l'analyse");
    }
  });

  it("gestionnaire connecte mais NON admin -> 403 (refus explicite, pas un 404 muet)", async () => {
    const r = await exigerAdminReprise("archiver ce dossier");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.statut).toBe(403);
      expect(r.message).toMatch(/directeurs et managers/i);
    }
  });

  it("directeur -> passe", async () => {
    vi.stubEnv("DIRECTEURS", "gestionnaire@real31.fr");
    const r = await exigerAdminReprise();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.gestionnaire.id).toBe("g1");
  });

  it("manager (graphie singulier MANAGER=) -> passe", async () => {
    vi.stubEnv("MANAGER", "gestionnaire@real31.fr");
    const r = await exigerAdminReprise();
    expect(r.ok).toBe(true);
  });

  it("super-admin -> passe (implication de role)", async () => {
    vi.stubEnv("SUPER_ADMINS", "gestionnaire@real31.fr");
    const r = await exigerAdminReprise();
    expect(r.ok).toBe(true);
  });

  it("session SANS email (dev sans SSO) -> refus : pas d'email, pas de role", async () => {
    vi.stubEnv("DIRECTEURS", "gestionnaire@real31.fr");
    etat.session = { id: "g1", initiales: "GG" };
    const r = await exigerAdminReprise();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.statut).toBe(403);
  });
});
