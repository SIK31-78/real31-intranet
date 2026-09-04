import { describe, it, expect } from "vitest";
import { compterAFaire, estEffectue, etatSuiviRecap } from "./suivi";

describe("etatSuiviRecap", () => {
  it("un horodatage present vaut effectue", () => {
    expect(etatSuiviRecap({ effectueLe: "2026-09-04T08:30:00Z" })).toBe("effectue");
  });

  it("sans horodatage : a faire", () => {
    expect(etatSuiviRecap({})).toBe("a_faire");
  });

  it("une chaine vide n'est pas un horodatage : a faire", () => {
    // Degradation possible cote base (colonne absente relue a vide) : on ne veut
    // surtout pas afficher « effectué » sur un recap que personne n'a marque.
    expect(etatSuiviRecap({ effectueLe: "" })).toBe("a_faire");
  });
});

describe("estEffectue / compterAFaire", () => {
  const lot = [
    { effectueLe: "2026-09-01T10:00:00Z" },
    {},
    { effectueLe: "" },
    { effectueLe: "2026-09-03T10:00:00Z" },
  ];

  it("estEffectue suit l'etat", () => {
    expect(estEffectue(lot[0]!)).toBe(true);
    expect(estEffectue(lot[1]!)).toBe(false);
  });

  it("compte ce qui reste a faire", () => {
    expect(compterAFaire(lot)).toBe(2);
    expect(compterAFaire([])).toBe(0);
  });
});
