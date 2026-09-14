import { describe, expect, it } from "vitest";
import { alerteMandat, SEUIL_ALERTE_MANDAT_MOIS } from "./alerte-mandat";

const AUJOURDHUI = "2026-09-14";

describe("alerteMandat", () => {
  it("se tait quand la fin du mandat est au-dela du seuil", () => {
    // 3 mois + 1 jour.
    expect(alerteMandat("2026-12-15", AUJOURDHUI)).toBeNull();
    expect(alerteMandat("2027-06-30", AUJOURDHUI)).toBeNull();
  });

  it("alerte pile au seuil, et en dessous", () => {
    expect(alerteMandat("2026-12-14", AUJOURDHUI)).toEqual({ joursAvantFin: 91, niveau: "proche" });
    // COLOMBI2-4 le 14/09/2026 : mandat fini le 30/09, aucune AG posee.
    expect(alerteMandat("2026-09-30", AUJOURDHUI)).toEqual({ joursAvantFin: 16, niveau: "proche" });
  });

  it("passe en « echu » quand le mandat est deja fini", () => {
    expect(alerteMandat("2026-06-30", AUJOURDHUI)).toEqual({ joursAvantFin: -76, niveau: "echu" });
  });

  it("le jour meme de la fin est encore « proche », pas « echu »", () => {
    expect(alerteMandat(AUJOURDHUI, AUJOURDHUI)).toEqual({ joursAvantFin: 0, niveau: "proche" });
  });

  it("le seuil est de 3 mois (regle de Sekou, 14/09/2026)", () => {
    expect(SEUIL_ALERTE_MANDAT_MOIS).toBe(3);
  });

  it("gere un seuil qui tombe sur un jour inexistant (31 + 3 mois)", () => {
    // 31/08 + 3 mois = « 31/11 », normalise au 01/12 : une fin au 30/11 alerte, au 02/12 non.
    expect(alerteMandat("2026-11-30", "2026-08-31")).not.toBeNull();
    expect(alerteMandat("2026-12-02", "2026-08-31")).toBeNull();
  });
});
