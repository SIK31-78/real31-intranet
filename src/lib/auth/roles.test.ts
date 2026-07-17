import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  rolesDe,
  aRole,
  estComptable,
  estManager,
  estDirecteur,
  estSuperAdmin,
  peutVoirComptabilite,
  estAdminReprise,
} from "./roles";

// Chaque test part d'un env VIDE (les vraies allowlists de .env.local ne doivent pas
// influencer les assertions), puis stubbe ce dont il a besoin.
beforeEach(() => {
  for (const v of [
    "COMPTABLES", "COMPTABLE",
    "MANAGERS", "MANAGER",
    "DIRECTEURS", "DIRECTEUR",
    "SUPER_ADMINS", "SUPER_ADMIN",
  ]) {
    vi.stubEnv(v, "");
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("rolesDe", () => {
  it("tout collaborateur authentifie est gestionnaire par defaut (aucune allowlist)", () => {
    expect([...rolesDe("gestionnaire@real31.fr")]).toEqual(["gestionnaire"]);
  });

  it("email absent -> gestionnaire seul (pas de role d'allowlist)", () => {
    vi.stubEnv("DIRECTEURS", "jean@real31.fr");
    expect([...rolesDe(null)]).toEqual(["gestionnaire"]);
    expect([...rolesDe(undefined)]).toEqual(["gestionnaire"]);
    expect([...rolesDe("")]).toEqual(["gestionnaire"]);
  });

  it("CUMUL : un email peut porter plusieurs roles", () => {
    vi.stubEnv("DIRECTEURS", "jean@real31.fr");
    vi.stubEnv("COMPTABLES", "jean@real31.fr");
    const roles = rolesDe("jean@real31.fr");
    expect(roles.has("gestionnaire")).toBe(true);
    expect(roles.has("directeur")).toBe(true);
    expect(roles.has("comptable")).toBe(true);
    expect(roles.has("manager")).toBe(false);
    expect(roles.has("super_admin")).toBe(false);
  });

  it("super_admin IMPLIQUE tous les roles (Sekou doit pouvoir tester chaque ecran)", () => {
    vi.stubEnv("SUPER_ADMINS", "sekou@real31.fr");
    const roles = rolesDe("sekou@real31.fr");
    for (const r of ["gestionnaire", "comptable", "manager", "directeur", "super_admin"] as const) {
      expect(roles.has(r)).toBe(true);
    }
  });
});

describe("sources d'env : graphies, casse et espaces", () => {
  it("PLURIEL (forme recommandee) : DIRECTEURS / MANAGERS", () => {
    vi.stubEnv("DIRECTEURS", "jean@real31.fr");
    vi.stubEnv("MANAGERS", "marie@real31.fr");
    expect(estDirecteur("jean@real31.fr")).toBe(true);
    expect(estManager("marie@real31.fr")).toBe(true);
  });

  it("SINGULIER (graphie toleree) : DIRECTEUR / MANAGER marchent aussi", () => {
    vi.stubEnv("DIRECTEUR", "jean@real31.fr");
    vi.stubEnv("MANAGER", "marie@real31.fr");
    expect(estDirecteur("jean@real31.fr")).toBe(true);
    expect(estManager("marie@real31.fr")).toBe(true);
  });

  it("les deux graphies se CUMULENT (union), l'une ne remplace pas l'autre", () => {
    vi.stubEnv("DIRECTEURS", "jean@real31.fr");
    vi.stubEnv("DIRECTEUR", "paul@real31.fr");
    expect(estDirecteur("jean@real31.fr")).toBe(true);
    expect(estDirecteur("paul@real31.fr")).toBe(true);
    expect(estDirecteur("autre@real31.fr")).toBe(false);
  });

  it("casse et espaces indifferents (des deux cotes)", () => {
    vi.stubEnv("MANAGERS", " Marie@Real31.FR , remi@real31.fr ");
    expect(estManager("marie@real31.fr")).toBe(true);
    expect(estManager("  REMI@REAL31.FR ")).toBe(true);
  });

  it("allowlist vide / absente -> personne n'a le role (jamais d'ouverture par defaut)", () => {
    expect(estDirecteur("jean@real31.fr")).toBe(false);
    expect(estManager("jean@real31.fr")).toBe(false);
    expect(estSuperAdmin("jean@real31.fr")).toBe(false);
  });

  it("aRole reflete rolesDe", () => {
    vi.stubEnv("MANAGERS", "marie@real31.fr");
    expect(aRole("marie@real31.fr", "manager")).toBe(true);
    expect(aRole("marie@real31.fr", "gestionnaire")).toBe(true);
    expect(aRole("marie@real31.fr", "directeur")).toBe(false);
  });
});

describe("estComptable", () => {
  it("email present dans COMPTABLES -> true (insensible a la casse / espaces)", () => {
    vi.stubEnv("COMPTABLES", "elsa@real31.fr, romain@real31.fr ");
    expect(estComptable("elsa@real31.fr")).toBe(true);
    expect(estComptable("ROMAIN@real31.fr")).toBe(true);
  });

  it("email hors allowlist -> false", () => {
    vi.stubEnv("COMPTABLES", "elsa@real31.fr");
    expect(estComptable("gestionnaire@real31.fr")).toBe(false);
  });

  it("COMPTABLES vide ou email absent -> false", () => {
    vi.stubEnv("COMPTABLES", "");
    expect(estComptable("elsa@real31.fr")).toBe(false);
    vi.stubEnv("COMPTABLES", "elsa@real31.fr");
    expect(estComptable(null)).toBe(false);
    expect(estComptable(undefined)).toBe(false);
  });
});

describe("peutVoirComptabilite", () => {
  it("un comptable accede", () => {
    vi.stubEnv("COMPTABLES", "elsa@real31.fr");
    vi.stubEnv("SUPER_ADMINS", "");
    expect(peutVoirComptabilite("elsa@real31.fr")).toBe(true);
  });

  it("un super-admin accede (test), meme hors COMPTABLES", () => {
    vi.stubEnv("COMPTABLES", "");
    vi.stubEnv("SUPER_ADMINS", "sekou@real31.fr");
    expect(peutVoirComptabilite("sekou@real31.fr")).toBe(true);
  });

  it("un gestionnaire normal n'accede pas", () => {
    vi.stubEnv("COMPTABLES", "elsa@real31.fr");
    vi.stubEnv("SUPER_ADMINS", "sekou@real31.fr");
    expect(peutVoirComptabilite("gestionnaire@real31.fr")).toBe(false);
  });

  it("un directeur n'accede PAS a la compta s'il n'est pas dans COMPTABLES (pas d'implication)", () => {
    vi.stubEnv("DIRECTEURS", "jean@real31.fr");
    expect(peutVoirComptabilite("jean@real31.fr")).toBe(false);
  });
});

describe("estAdminReprise", () => {
  it("un directeur est admin reprise", () => {
    vi.stubEnv("DIRECTEURS", "jean@real31.fr");
    expect(estAdminReprise("jean@real31.fr")).toBe(true);
  });

  it("un manager est admin reprise", () => {
    vi.stubEnv("MANAGERS", "marie@real31.fr");
    expect(estAdminReprise("marie@real31.fr")).toBe(true);
  });

  it("les graphies singulier DIRECTEUR= / MANAGER= marchent aussi", () => {
    vi.stubEnv("DIRECTEUR", "jean@real31.fr");
    vi.stubEnv("MANAGER", "marie@real31.fr");
    expect(estAdminReprise("jean@real31.fr")).toBe(true);
    expect(estAdminReprise("marie@real31.fr")).toBe(true);
  });

  it("un super-admin est admin reprise (implication)", () => {
    vi.stubEnv("SUPER_ADMINS", "sekou@real31.fr");
    expect(estAdminReprise("sekou@real31.fr")).toBe(true);
  });

  it("un gestionnaire normal N'EST PAS admin reprise (il garde le suivi)", () => {
    vi.stubEnv("DIRECTEURS", "jean@real31.fr");
    vi.stubEnv("MANAGERS", "marie@real31.fr");
    expect(estAdminReprise("gestionnaire@real31.fr")).toBe(false);
    expect(estAdminReprise(null)).toBe(false);
  });

  it("un comptable seul n'est PAS admin reprise", () => {
    vi.stubEnv("COMPTABLES", "elsa@real31.fr");
    expect(estAdminReprise("elsa@real31.fr")).toBe(false);
  });
});
