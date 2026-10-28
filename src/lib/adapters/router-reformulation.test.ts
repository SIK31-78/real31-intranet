// Interrupteur de la reformulation (ADR-051) : coupé par défaut, ouvert seulement avec
// IA_REFORMULATION=on ET la clé ; la démonstration sans réseau jamais en production.

import { afterEach, describe, expect, it, vi } from "vitest";
import { getReformulationProvider } from "./router";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getReformulationProvider", () => {
  it("coupé par défaut (variable absente), même avec la clé", () => {
    vi.stubEnv("IA_REFORMULATION", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect(getReformulationProvider()).toBeNull();
    vi.stubEnv("IA_REFORMULATION", "off");
    expect(getReformulationProvider()).toBeNull();
  });

  it("ouvert avec IA_REFORMULATION=on et la clé", () => {
    vi.stubEnv("IA_REFORMULATION", "on");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect(getReformulationProvider()?.nom).toBe("anthropic");
  });

  it("interrupteur posé mais clé absente : coupé (pas de bouton qui échoue à chaque clic)", () => {
    vi.stubEnv("IA_REFORMULATION", "on");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(getReformulationProvider()).toBeNull();
  });

  it("démonstration hors production seulement", () => {
    vi.stubEnv("IA_REFORMULATION", "mock");
    expect(getReformulationProvider()?.nom).toBe("mock");
    vi.stubEnv("NODE_ENV", "production");
    expect(getReformulationProvider()).toBeNull();
  });
});
