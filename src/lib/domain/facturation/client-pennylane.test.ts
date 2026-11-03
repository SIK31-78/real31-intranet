import { describe, expect, it } from "vitest";
import { identiteClientPennylane } from "./client-pennylane";

describe("identiteClientPennylane", () => {
  it("reprend la forme des clients existants : SDC + adresse en majuscules", () => {
    expect(identiteClientPennylane("SDC 4 rue Gaultier - S305")).toEqual({
      prenom: "SDC",
      nom: "4 RUE GAULTIER - S305",
      nomAffiche: "SDC 4 RUE GAULTIER - S305",
    });
  });

  it("retire accents et virgule, comme « 40/50 RUE GABRIEL PERI »", () => {
    expect(identiteClientPennylane("SDC 18, rue de Sébastopol - S311").nom).toBe("18 RUE DE SEBASTOPOL - S311");
  });

  it("tolere l'absence du prefixe SDC et les espaces en trop", () => {
    expect(identiteClientPennylane("  37 bis  Avenue de Saint-Germain - S303 ").nomAffiche).toBe("SDC 37 BIS AVENUE DE SAINT-GERMAIN - S303");
  });
});
