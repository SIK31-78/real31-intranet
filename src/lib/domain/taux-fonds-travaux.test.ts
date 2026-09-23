import { describe, expect, it } from "vitest";
import { formatPourcentage, tauxFondsTravaux } from "./taux-fonds-travaux";

describe("tauxFondsTravaux", () => {
  it("constate les 5 % de droit commun sur les vrais budgets de la S0306", () => {
    // Mesure eStale du 23/09/2026 : budget ALUR 5 500 sur un budget ordinaire de 110 000.
    const t = tauxFondsTravaux(5500, 110000);
    expect(t).toEqual({
      taux: 0.05,
      regime: "droit-commun",
      libelle: "aujourd'hui = 5 % du budget annuel",
    });
  });

  it("reconnaît le taux des copropriétés dotées d'un PPT et le nomme", () => {
    const t = tauxFondsTravaux(2750, 110000);
    expect(t?.regime).toBe("ppt");
    expect(t?.libelle).toContain("2,5 %");
    expect(t?.libelle).toContain("PPT");
  });

  it("annonce un taux hors repère sans prétendre connaître le régime", () => {
    const t = tauxFondsTravaux(4125, 110000);
    expect(t?.regime).toBe("autre");
    expect(t?.libelle).toBe("aujourd'hui = 3,75 % du budget annuel");
  });

  it("tolère l'arrondi des montants appelés", () => {
    expect(tauxFondsTravaux(5499.5, 110000)?.regime).toBe("droit-commun");
  });

  it("ne dit rien quand un budget manque (on n'invente pas de taux)", () => {
    expect(tauxFondsTravaux(undefined, 110000)).toBeNull();
    expect(tauxFondsTravaux(5500, undefined)).toBeNull();
    expect(tauxFondsTravaux(5500, 0)).toBeNull();
    expect(tauxFondsTravaux(0, 110000)).toBeNull();
  });
});

describe("formatPourcentage", () => {
  it("écrit le taux à la française", () => {
    expect(formatPourcentage(0.05)).toBe("5 %");
    expect(formatPourcentage(0.025)).toBe("2,5 %");
    expect(formatPourcentage(0.0375)).toBe("3,75 %");
  });
});
