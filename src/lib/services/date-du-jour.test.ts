import { afterEach, describe, expect, it, vi } from "vitest";
import { ancreDuJour, ANCRE_MOCK, jourParis } from "./date-du-jour";

afterEach(() => vi.unstubAllEnvs());

describe("jourParis", () => {
  it("a 23 h 30 UTC, c'est deja demain a Paris (ete comme hiver)", () => {
    expect(jourParis(new Date("2026-09-15T23:30:00Z"))).toBe("2026-09-16");
    expect(jourParis(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(jourParis(new Date("2026-09-16T10:00:00Z"))).toBe("2026-09-16");
  });
});

describe("ancreDuJour", () => {
  it("vraie data : le jour de Paris ; mock : l'ancre des jeux de demo", () => {
    vi.stubEnv("COPRO_SOURCE", "supabase");
    expect(ancreDuJour()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    vi.stubEnv("COPRO_SOURCE", "mock");
    expect(ancreDuJour()).toBe(ANCRE_MOCK);
  });
});
