import { describe, it, expect, afterEach, vi } from "vitest";
import { estComptable, peutVoirComptabilite } from "./roles";

afterEach(() => {
  vi.unstubAllEnvs();
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
});
