import { describe, expect, it } from "vitest";
import { estJourISO, formatJourFR, joursEntre, plusAnnees, plusJours, plusMois } from "./dates";

describe("estJourISO", () => {
  it("accepte un vrai jour, refuse la forme ou le jour inexistant", () => {
    expect(estJourISO("2026-03-12")).toBe(true);
    expect(estJourISO("2024-02-29")).toBe(true);
    expect(estJourISO("2026-02-30")).toBe(false);
    expect(estJourISO("2026-13-01")).toBe(false);
    expect(estJourISO("12/03/2026")).toBe(false);
    expect(estJourISO("")).toBe(false);
    expect(estJourISO(null)).toBe(false);
    expect(estJourISO(undefined)).toBe(false);
  });
});

describe("joursEntre / plusJours", () => {
  it("compte les jours civils, dans les deux sens", () => {
    expect(joursEntre("2026-09-16", "2026-09-18")).toBe(2);
    expect(joursEntre("2026-09-18", "2026-09-16")).toBe(-2);
    expect(joursEntre("2026-03-28", "2026-03-30")).toBe(2); // passage à l'heure d'été : pas de fuseau ici
  });
  it("ajoute ou retire des jours en passant les mois et les années", () => {
    expect(plusJours("2026-12-31", 1)).toBe("2027-01-01");
    expect(plusJours("2027-03-01", -180)).toBe("2026-09-02");
  });
});

describe("plusMois", () => {
  it("ajoute des mois, année comprise", () => {
    expect(plusMois("2026-03-15", 12)).toBe("2027-03-15");
    expect(plusMois("2026-11-15", 3)).toBe("2027-02-15");
    expect(plusMois("2026-03-15", -3)).toBe("2025-12-15");
  });
  it("ramène un 31 qui déborde au dernier jour du mois cible", () => {
    expect(plusMois("2026-01-31", 1)).toBe("2026-02-28");
    expect(plusMois("2024-01-31", 1)).toBe("2024-02-29");
    expect(plusMois("2026-08-31", 1)).toBe("2026-09-30");
    expect(plusMois("2026-11-30", 3)).toBe("2027-02-28");
  });
});

describe("plusAnnees", () => {
  it("ajoute des années, un 29 février ramené au 28", () => {
    expect(plusAnnees("2026-03-12", 5)).toBe("2031-03-12");
    expect(plusAnnees("2024-02-29", 5)).toBe("2029-02-28");
    expect(plusAnnees("2024-02-29", 4)).toBe("2028-02-29");
    expect(plusAnnees("2026-05-17", -2)).toBe("2024-05-17");
  });
});

describe("formatJourFR", () => {
  it("rend jj/mm/aaaa et laisse passer l'illisible", () => {
    expect(formatJourFR("2026-03-12")).toBe("12/03/2026");
    expect(formatJourFR("2026-03-12T10:00:00Z")).toBe("12/03/2026");
    expect(formatJourFR("n'importe quoi")).toBe("n'importe quoi");
    expect(formatJourFR(null)).toBe("");
  });
});
