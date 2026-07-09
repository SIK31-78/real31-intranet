// Tests du garde-fou "doux" a la saisie d'une date de reunion AG / CS. Fonction
// PURE : comparaison de chaines 'YYYY-MM-DD', on avertit sans bloquer.

import { describe, it, expect } from "vitest";
import { avertissementDateReunion } from "./validation-date-reunion";

const TODAY = "2026-07-08";

describe("avertissementDateReunion", () => {
  it("prochaine dans le passe -> avertit", () => {
    expect(avertissementDateReunion("prochaine", "2026-07-07", TODAY)).toMatch(/passée/);
    expect(avertissementDateReunion("prochaine", "2020-01-01", TODAY)).toMatch(/passée/);
  });

  it("prochaine aujourd'hui ou dans le futur -> pas d'avertissement", () => {
    expect(avertissementDateReunion("prochaine", TODAY, TODAY)).toBeNull();
    expect(avertissementDateReunion("prochaine", "2026-12-31", TODAY)).toBeNull();
  });

  it("derniere dans le futur -> avertit", () => {
    expect(avertissementDateReunion("derniere", "2026-07-09", TODAY)).toMatch(/futur/);
    expect(avertissementDateReunion("derniere", "2030-01-01", TODAY)).toMatch(/futur/);
  });

  it("derniere aujourd'hui ou dans le passe -> pas d'avertissement", () => {
    expect(avertissementDateReunion("derniere", TODAY, TODAY)).toBeNull();
    expect(avertissementDateReunion("derniere", "2025-04-16", TODAY)).toBeNull();
  });

  it("format invalide / vide -> pas d'avertissement (defensif)", () => {
    expect(avertissementDateReunion("prochaine", "", TODAY)).toBeNull();
    expect(avertissementDateReunion("prochaine", "2026-07", TODAY)).toBeNull();
    expect(avertissementDateReunion("derniere", "pas une date", TODAY)).toBeNull();
  });
});
