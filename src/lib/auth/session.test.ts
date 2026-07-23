// Tests de la logique d'IMPERSONATION (cloisonnement) et du fallback de session.
//
// Le point chaud (F1) : sans SSO configure, un deploiement de PRODUCTION ne doit JAMAIS
// laisser incarner un gestionnaire (fail-closed) - sinon n'importe qui derriere le seul
// mot de passe Basic partage se met dans la peau de n'importe quel gestionnaire reel.
//
// La decision vit dans `impersonationAutoriseePure` (env passe en arguments explicites) :
// on la teste offline, sans SSO, sans reseau. Les dependances lourdes de session.ts (@/auth,
// next/headers, router, react.cache) sont MOCKEES pour que l'import reste deterministe.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

// react.cache -> identite : getGestionnaireCourant est wrap dans cache() au chargement du
// module ; hors contexte de rendu on veut juste la fonction (re-executable a chaque appel).
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T): T => fn };
});

// SSO non configure par defaut (mode sans SSO) : c'est l'axe du test F1. `auth()` ne renvoie
// jamais de session ici (on ne teste pas le chemin SSO reel, couvert par le versant pur).
vi.mock("@/auth", () => ({
  ssoConfigure: false,
  auth: vi.fn(async () => null),
}));

// Aucun cookie gid pose : le selecteur d'impersonation n'a rien a incarner.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

// Repo gestionnaire stub : le fallback dev renvoie le PREMIER ; en prod on ne doit jamais
// l'atteindre (retour null avant le list()).
const PREMIER = { id: "g1", nom: "Premier Gestionnaire", email: "premier@example.test" };
vi.mock("@/lib/adapters/router", () => ({
  getGestionnaireRepository: () => ({
    findById: vi.fn(async () => null),
    findByEmail: vi.fn(async () => null),
    list: vi.fn(async () => [PREMIER]),
  }),
}));

import {
  impersonationAutoriseePure,
  impersonationAutorisee,
  getGestionnaireCourant,
} from "./session";
import { estSuperAdmin } from "./roles";

beforeEach(() => {
  vi.stubEnv("SUPER_ADMINS", "");
  vi.stubEnv("SUPER_ADMIN", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("impersonationAutoriseePure (decision pure, F1)", () => {
  it("(a) prod + SSO : un gestionnaire NON super-admin ne peut PAS incarner", () => {
    expect(
      impersonationAutoriseePure({ ssoConfigure: true, nodeEnv: "production", estSuperAdmin: false }),
    ).toBe(false);
  });

  it("(a) prod + SSO : un super-admin connecte PEUT incarner", () => {
    expect(
      impersonationAutoriseePure({ ssoConfigure: true, nodeEnv: "production", estSuperAdmin: true }),
    ).toBe(true);
  });

  it("(b) prod SANS SSO : REFUS pour tous (fail-closed) - meme le flag super-admin ne rouvre pas", () => {
    expect(
      impersonationAutoriseePure({ ssoConfigure: false, nodeEnv: "production", estSuperAdmin: false }),
    ).toBe(false);
    // Sans identite verifiee (pas de SSO), le flag super-admin ne veut rien dire -> reste ferme.
    expect(
      impersonationAutoriseePure({ ssoConfigure: false, nodeEnv: "production", estSuperAdmin: true }),
    ).toBe(false);
  });

  it("(c) dev SANS SSO : selecteur libre (true), y compris NODE_ENV absent", () => {
    expect(
      impersonationAutoriseePure({ ssoConfigure: false, nodeEnv: "development", estSuperAdmin: false }),
    ).toBe(true);
    expect(
      impersonationAutoriseePure({ ssoConfigure: false, nodeEnv: undefined, estSuperAdmin: false }),
    ).toBe(true);
  });

  it("dev + SSO : seul le super-admin incarne (le SSO passe en premier meme en dev)", () => {
    expect(
      impersonationAutoriseePure({ ssoConfigure: true, nodeEnv: "development", estSuperAdmin: false }),
    ).toBe(false);
    expect(
      impersonationAutoriseePure({ ssoConfigure: true, nodeEnv: "development", estSuperAdmin: true }),
    ).toBe(true);
  });

  it("le flag super-admin se resout bien via l'allowlist d'env (integration roles)", () => {
    vi.stubEnv("SUPER_ADMINS", "sekou@real31.fr");
    const decide = (email: string | null) =>
      impersonationAutoriseePure({
        ssoConfigure: true,
        nodeEnv: "production",
        estSuperAdmin: estSuperAdmin(email),
      });
    expect(decide("sekou@real31.fr")).toBe(true);
    expect(decide("gestionnaire@real31.fr")).toBe(false);
    expect(decide(null)).toBe(false);
  });
});

describe("impersonationAutorisee (wrapper, cable sur l'env reel, mode sans SSO)", () => {
  it("dev sans SSO -> true", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(impersonationAutorisee()).resolves.toBe(true);
  });

  it("prod sans SSO -> false (comportement F1 de bout en bout)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(impersonationAutorisee()).resolves.toBe(false);
  });
});

describe("getGestionnaireCourant (fallback sans SSO)", () => {
  it("(d) prod, sans cookie, sans SSO -> null (jamais servir un gestionnaire reel a un anonyme)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(getGestionnaireCourant()).resolves.toBeNull();
  });

  it("dev, sans cookie, sans SSO -> premier gestionnaire (confort de dev)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(getGestionnaireCourant()).resolves.toEqual(PREMIER);
  });
});
