import { describe, expect, it } from "vitest";
import { creneauCsSuggere } from "./creneau-cs-suggere";

describe("creneauCsSuggere (REA-109)", () => {
  it("prend la prochaine date du CS et son heure", () => {
    expect(creneauCsSuggere({ prochaineCsDate: "2026-10-14", prochaineCsHeure: "18:30", derniereCsDate: "2025-10-10" }, undefined)).toEqual({
      jour: "2026-10-14",
      debut: "18:30",
    });
  });

  it("CS deja passe (date glissee en derniere a la cloture de l'ODJ) : reprend la derniere date", () => {
    expect(creneauCsSuggere({ derniereCsDate: "2026-10-01" }, undefined)).toEqual({ jour: "2026-10-01", debut: "" });
  });

  it("CS tenu : reprend l'heure de debut glissee avec la date (REA-109), pas celle d'une autre date", () => {
    expect(creneauCsSuggere({ derniereCsDate: "2026-10-01", derniereCsHeure: "19:00" }, undefined)).toEqual({
      jour: "2026-10-01",
      debut: "19:00",
    });
    // Une prochaine date existe : c'est elle (et son heure) qui compte.
    expect(
      creneauCsSuggere(
        { prochaineCsDate: "2026-12-01", derniereCsDate: "2026-10-01", derniereCsHeure: "19:00" },
        undefined,
      ),
    ).toEqual({ jour: "2026-12-01", debut: "" });
  });

  it("reprend l'heure de fin quand la confirmation porte sur ce jour-la, pas sur une autre seance", () => {
    expect(creneauCsSuggere({ derniereCsDate: "2026-10-01" }, { date: "2026-10-01", heureFin: "21:00" })?.fin).toBe("21:00");
    expect(creneauCsSuggere({ derniereCsDate: "2026-10-01" }, { date: "2026-09-20", heureFin: "21:00" })?.fin).toBeUndefined();
  });

  it("aucune date de CS : rien a proposer", () => {
    expect(creneauCsSuggere({}, undefined)).toBeUndefined();
    expect(creneauCsSuggere(undefined, undefined)).toBeUndefined();
  });
});
