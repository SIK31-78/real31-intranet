import { describe, expect, it } from "vitest";
import { heureDebutSuggeree, heureFinSuggeree } from "./creneau-suggere";

describe("creneau d'AG suggere au recap", () => {
  it("reprend l'heure connue de l'AG", () => {
    expect(heureDebutSuggeree("18:30")).toBe("18:30");
    expect(heureDebutSuggeree("09:15:00")).toBe("09:15");
  });

  it("retombe sur 18:00 si l'heure est absente ou illisible", () => {
    expect(heureDebutSuggeree(undefined)).toBe("18:00");
    expect(heureDebutSuggeree("")).toBe("18:00");
    expect(heureDebutSuggeree("25:00")).toBe("18:00");
  });

  it("fin = debut + 2 h, sans deborder de la journee", () => {
    expect(heureFinSuggeree("18:30")).toBe("20:30");
    expect(heureFinSuggeree("18:00")).toBe("20:00");
    expect(heureFinSuggeree("22:45")).toBe("23:59");
  });
});
