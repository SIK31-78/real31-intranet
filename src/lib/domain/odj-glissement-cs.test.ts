import { describe, it, expect } from "vitest";
import {
  doitGlisserCs,
  formatGlissementCs,
  parseGlissementCs,
} from "./odj-glissement-cs";

describe("doitGlisserCs", () => {
  it("glisse une date passee (le cas BLEUETS4 du 2026-09-10)", () => {
    expect(doitGlisserCs("2026-09-03", "2026-09-10T09:12:00.000Z")).toBe(true);
  });

  it("glisse une reunion tenue le jour meme", () => {
    expect(doitGlisserCs("2026-09-10", "2026-09-10T18:40:00.000Z")).toBe(true);
  });

  it("ne touche PAS a un CS encore a venir (ODJ cloture en avance)", () => {
    expect(doitGlisserCs("2026-09-24", "2026-09-10T09:00:00.000Z")).toBe(false);
  });

  it("ne fait rien sans prochaine date", () => {
    expect(doitGlisserCs(undefined, "2026-09-10T09:00:00.000Z")).toBe(false);
    expect(doitGlisserCs("", "2026-09-10T09:00:00.000Z")).toBe(false);
  });

  it("accepte un horodatage complet en prochaine date", () => {
    expect(doitGlisserCs("2026-09-03T18:00:00.000Z", "2026-09-10T09:00:00.000Z")).toBe(true);
  });
});

describe("formatGlissementCs / parseGlissementCs", () => {
  it("fait l'aller-retour", () => {
    const s = formatGlissementCs("2026-09-03", "2025-09-05");
    expect(s).toBe("2026-09-03|2025-09-05");
    expect(parseGlissementCs(s)).toEqual({ glissee: "2026-09-03", ancienneDerniere: "2025-09-05" });
  });

  it("supporte l'absence d'ancienne derniere date", () => {
    const s = formatGlissementCs("2026-09-03", undefined);
    expect(s).toBe("2026-09-03|");
    expect(parseGlissementCs(s)).toEqual({ glissee: "2026-09-03", ancienneDerniere: "" });
  });

  it("tronque les horodatages au jour", () => {
    expect(formatGlissementCs("2026-09-03T18:00:00.000Z", "2025-09-05T10:00:00.000Z")).toBe(
      "2026-09-03|2025-09-05",
    );
  });

  it("refuse une valeur vide ou illisible plutot que d'ecrire n'importe quoi", () => {
    expect(parseGlissementCs(null)).toBeUndefined();
    expect(parseGlissementCs("")).toBeUndefined();
    expect(parseGlissementCs("|2025-09-05")).toBeUndefined();
    expect(parseGlissementCs("bientot|2025-09-05")).toBeUndefined();
  });
});
