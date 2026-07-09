// Tests des helpers d'heure de reunion (increment "heure AG/CS"). Fonctions PURES :
// extraction de l'heure depuis un timestamp referentiel + calcul de la fin (+2h).

import { describe, it, expect } from "vitest";
import {
  DUREE_REUNION_HEURES,
  HEURE_DEFAUT_REUNION,
  finReunion,
  heureDe,
} from "./reunion";

describe("heureDe", () => {
  it("extrait l'heure d'un timestamp datetime -> 'HH:mm'", () => {
    expect(heureDe("2026-09-07T18:00:00")).toBe("18:00");
    expect(heureDe("2026-09-07T18:30:00.000Z")).toBe("18:30");
    expect(heureDe("2026-09-07T09:05:00")).toBe("09:05");
  });

  it("minuit (donnees existantes posees sans heure) -> pas d'heure (journee entiere)", () => {
    expect(heureDe("2026-09-07T00:00:00")).toBeUndefined();
  });

  it("absent / vide / format invalide -> pas d'heure", () => {
    expect(heureDe(null)).toBeUndefined();
    expect(heureDe(undefined)).toBeUndefined();
    expect(heureDe("")).toBeUndefined();
    expect(heureDe("2026-09-07")).toBeUndefined(); // jour seul, pas d'heure
    expect(heureDe("pas une date")).toBeUndefined();
  });
});

describe("finReunion", () => {
  it("ajoute la duree de reunion (2h) a un debut datetime", () => {
    expect(DUREE_REUNION_HEURES).toBe(2);
    expect(finReunion("2026-09-07T18:00:00")).toBe("2026-09-07T20:00:00");
    expect(finReunion("2026-09-07T18:30")).toBe("2026-09-07T20:30:00");
  });

  it("gere le passage de minuit (jour suivant)", () => {
    expect(finReunion("2026-09-07T23:00:00")).toBe("2026-09-08T01:00:00");
    expect(finReunion("2026-09-07T23:30:00")).toBe("2026-09-08T01:30:00");
  });

  it("gere le passage de mois", () => {
    expect(finReunion("2026-09-30T23:00:00")).toBe("2026-10-01T01:00:00");
  });

  it("entree non datetime (jour seul) -> renvoyee inchangee (defensif)", () => {
    expect(finReunion("2026-09-07")).toBe("2026-09-07");
  });

  it("l'heure par defaut est bien 18:00", () => {
    expect(HEURE_DEFAUT_REUNION).toBe("18:00");
    expect(finReunion(`2026-09-07T${HEURE_DEFAUT_REUNION}:00`)).toBe("2026-09-07T20:00:00");
  });
});
