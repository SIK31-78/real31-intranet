import { describe, expect, it } from "vitest";
import { ADRESSE_A_PRECISER, libelleAdresse, motifRefusSuppression } from "./proposition";

describe("libelleAdresse", () => {
  it("affiche l'adresse, ou « Adresse à préciser » pour un immeuble neuf", () => {
    expect(libelleAdresse({ adresse: "16 rue Sébastopol" })).toBe("16 rue Sébastopol");
    expect(libelleAdresse({ adresse: "  " })).toBe(ADRESSE_A_PRECISER);
  });
});

describe("motifRefusSuppression", () => {
  it("un doublon se supprime, pas une proposition qui a donne une copropriete", () => {
    expect(motifRefusSuppression({})).toBeNull();
    expect(motifRefusSuppression({ coproCode: "S307" })).toBe("Cette proposition a donné la copropriété S307 : elle ne se supprime pas.");
  });
});
