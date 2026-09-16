import { describe, expect, it } from "vitest";
import { formatEuros } from "./format-montant";

const NB = " ";

describe("formatEuros", () => {
  it("separe les milliers au-dela du million (le bug de format.ts)", () => {
    expect(formatEuros(1234567.5)).toBe(`1${NB}234${NB}567,50${NB}€`);
    expect(formatEuros(4500)).toBe(`4${NB}500,00${NB}€`);
    expect(formatEuros(0)).toBe(`0,00${NB}€`);
    expect(formatEuros(-12.3)).toBe(`-12,30${NB}€`);
  });
  it("sans decimales, ou seulement celles qu'il faut", () => {
    expect(formatEuros(4944.4, { decimales: 0 })).toBe(`4${NB}944${NB}€`);
    expect(formatEuros(4944, { decimales: "auto" })).toBe(`4${NB}944${NB}€`);
    expect(formatEuros(4944.5, { decimales: "auto" })).toBe(`4${NB}944,5${NB}€`);
  });
});
