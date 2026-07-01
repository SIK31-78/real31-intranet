import { describe, expect, it } from "vitest";
import { avancement, creerDossier, etapesParDefaut, PHASES } from "../dossier";

describe("dossier d'onboarding", () => {
  it("cree un dossier avec la checklist par defaut (P/V/C/cloture)", () => {
    const d = creerDossier("S0302", "44 et 50 rue Gabriel Peri");
    expect(d.ref).toBe("S0302");
    expect(d.statut).toBe("production");
    expect(d.etapes.map((e) => e.code)).toContain("P3");
    expect(d.etapes.map((e) => e.code)).toContain("V4");
    expect(d.etapes.map((e) => e.code)).toContain("C6");
    expect(d.etapes.map((e) => e.code)).toContain("CLOTURE");
  });

  it("toutes les etapes referencent une phase connue", () => {
    for (const e of etapesParDefaut()) {
      expect(PHASES).toContain(e.phase);
    }
  });

  it("avancement = part des etapes faites/ignorees", () => {
    const d = creerDossier("S0303", "Test");
    expect(avancement(d)).toBe(0);
    d.etapes[0]!.statut = "fait";
    d.etapes[1]!.statut = "ignore";
    expect(avancement(d)).toBeCloseTo(2 / d.etapes.length);
  });
});
