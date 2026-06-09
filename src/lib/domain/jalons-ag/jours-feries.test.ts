import { describe, it, expect } from "vitest";
import { joursFeries } from "./jours-feries";

describe("joursFeries", () => {
  it("contient les 11 feries francais (fixes + mobiles)", () => {
    const f = joursFeries(2026);
    expect(f.size).toBe(11);
    // Fixes
    expect(f.has("2026-01-01")).toBe(true);
    expect(f.has("2026-05-01")).toBe(true);
    expect(f.has("2026-07-14")).toBe(true);
    expect(f.has("2026-12-25")).toBe(true);
    // Mobiles (Paques 2026 = 5 avril)
    expect(f.has("2026-04-06")).toBe(true); // lundi de Paques
    expect(f.has("2026-05-14")).toBe(true); // Ascension
    expect(f.has("2026-05-25")).toBe(true); // lundi de Pentecote
  });

  it("gere une autre annee (Paques 2024 = 31 mars)", () => {
    const f = joursFeries(2024);
    expect(f.has("2024-04-01")).toBe(true); // lundi de Paques
    expect(f.has("2024-05-09")).toBe(true); // Ascension
  });
});
