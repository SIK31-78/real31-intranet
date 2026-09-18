import { describe, expect, it } from "vitest";
import { codeTiroir, libellePosition, occupationArmoire, positionTiroir, premierBacLibre } from "./armoire";

describe("armoire : 6 colonnes de 20 bacs", () => {
  it("place T001 en haut de la premiere colonne, T021 en haut de la deuxieme, T120 en bas de la sixieme", () => {
    expect(positionTiroir("T001")).toMatchObject({ colonne: 1, bac: 1 });
    expect(positionTiroir("T020")).toMatchObject({ colonne: 1, bac: 20 });
    expect(positionTiroir("T021")).toMatchObject({ colonne: 2, bac: 1 });
    expect(positionTiroir("t41")).toMatchObject({ code: "T041", colonne: 3, bac: 1 });
    expect(positionTiroir("T120")).toMatchObject({ colonne: 6, bac: 20 });
  });
  it("ignore ce qui n'est pas un tiroir de l'armoire", () => {
    expect(positionTiroir("S143")).toBeNull();
    expect(positionTiroir("T121")).toBeNull();
    expect(positionTiroir("")).toBeNull();
    expect(positionTiroir(undefined)).toBeNull();
  });
  it("dit ou c'est", () => {
    expect(libellePosition(positionTiroir("T041")!)).toBe("colonne 3, bac 1 (en haut)");
    expect(libellePosition(positionTiroir("T040")!)).toBe("colonne 2, bac 20 (en bas)");
    expect(libellePosition(positionTiroir("T045")!)).toBe("colonne 3, bac 5");
    expect(codeTiroir(7)).toBe("T007");
  });
  it("dessine l'occupation : vide, ok, reserve, sorti, retard ; les retires et hors armoire ne comptent pas", () => {
    const { bacs, horsArmoire } = occupationArmoire([
      { id: "a", numero: "R001", etat: "en_agence", emplacement: "T001" },
      { id: "b", numero: "R002", etat: "sorti", emplacement: "T001" },
      { id: "c", numero: "R003", etat: "en_retard", emplacement: "T002" },
      { id: "d", numero: "R004", etat: "reserve", emplacement: "T003" },
      { id: "e", numero: "R005", etat: "retire", emplacement: "T004" },
      { id: "f", numero: "R006", etat: "en_agence", emplacement: "S143" },
      { id: "g", numero: "R007", etat: "en_agence" },
    ]);
    expect(bacs).toHaveLength(120);
    expect(bacs[0]).toMatchObject({ code: "T001", ton: "warn" });
    expect(bacs[0].trousseaux.map((t) => t.numero)).toEqual(["R001", "R002"]);
    expect(bacs[1].ton).toBe("err");
    expect(bacs[2].ton).toBe("info");
    expect(bacs[3].ton).toBe("vide");
    expect(horsArmoire.map((t) => t.numero)).toEqual(["R006", "R007"]);
    expect(premierBacLibre(bacs)).toBe("T004");
  });
});
