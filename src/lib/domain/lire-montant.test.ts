import { describe, expect, it } from "vitest";
import { lireMontant } from "./lire-montant";

describe("lireMontant", () => {
  it("lit les milliers separes par une espace, ordinaire, insecable ou fine", () => {
    expect(lireMontant("12 500")).toBe(12500);
    expect(lireMontant("12 500")).toBe(12500);
    expect(lireMontant("1 234 567,89")).toBe(1234567.89);
  });

  it("accepte la virgule ou le point decimal, et le symbole euro", () => {
    expect(lireMontant("12 500,50 €")).toBe(12500.5);
    expect(lireMontant("4500.5")).toBe(4500.5);
    expect(lireMontant("  228 € ")).toBe(228);
    expect(lireMontant("7,20")).toBe(7.2);
    expect(lireMontant("12 500 EUR")).toBe(12500);
  });

  it("prend le point pour un separateur de milliers quand une virgule decimale suit", () => {
    expect(lireMontant("12.500,50")).toBe(12500.5);
  });

  it("garde le signe", () => {
    expect(lireMontant("-12,30")).toBe(-12.3);
  });

  it("rend null pour une saisie vide ou illisible, jamais 0", () => {
    expect(lireMontant("")).toBeNull();
    expect(lireMontant("   ")).toBeNull();
    expect(lireMontant(undefined)).toBeNull();
    expect(lireMontant(null)).toBeNull();
    expect(lireMontant("abc")).toBeNull();
    expect(lireMontant("12,5,3")).toBeNull();
    expect(lireMontant("1e3")).toBeNull();
    expect(lireMontant("0x10")).toBeNull();
    expect(lireMontant("€")).toBeNull();
  });

  it("laisse passer un nombre deja lu", () => {
    expect(lireMontant(42.5)).toBe(42.5);
    expect(lireMontant(Number.NaN)).toBeNull();
  });
});
