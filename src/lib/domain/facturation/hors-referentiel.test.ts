import { describe, expect, it } from "vitest";
import { coprosHorsReferentiel } from "./hors-referentiel";

const c = (code: string, nom = code) => ({ code, nom });

describe("coprosHorsReferentiel", () => {
  it("garde les copros ESTALE sans aucune reference au referentiel", () => {
    expect(coprosHorsReferentiel([c("S0307", "Saint-Ouen"), c("S0300")], ["S0300"])).toEqual([
      { code: "S0307", nom: "Saint-Ouen" },
    ]);
  });

  it("rapproche les references normalisees (zeros de tete, casse, espaces)", () => {
    expect(coprosHorsReferentiel([c("S0297"), c("s305")], [" S297", "S0305"])).toEqual([]);
  });

  it("ignore la copro de test SE999", () => {
    expect(coprosHorsReferentiel([c("SE999"), c("SE0999")], [])).toEqual([]);
  });

  it("trie par code, numerique", () => {
    expect(coprosHorsReferentiel([c("S0310"), c("S0302"), c("S0045")], []).map((x) => x.code)).toEqual([
      "S0045",
      "S0302",
      "S0310",
    ]);
  });

  it("referentiel vide : toutes les copros ESTALE sortent", () => {
    expect(coprosHorsReferentiel([c("S0301")], [])).toHaveLength(1);
  });
});
