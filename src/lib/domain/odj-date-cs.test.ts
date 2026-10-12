// La date du CS a l'ecran et dans les documents remplis porte l'heure (REA-143).

import { describe, expect, it } from "vitest";
import type { Odj } from "./odj";
import { dateCourteOdj, dateHeureCs, dateSeuleCs } from "./odj";
import { arbreOdj, nomFichierOdjRempli } from "./odj-rendu";

describe("dateHeureCs", () => {
  it("ajoute l'heure a la francaise", () => {
    expect(dateHeureCs("2026-10-05", "18:30")).toBe("05/10/2026 à 18h30");
    expect(dateHeureCs("2026-10-05T00:00:00", "9:05")).toBe("05/10/2026 à 09h05");
  });
  it("sans heure, la date seule", () => {
    expect(dateHeureCs("2026-10-05", undefined)).toBe("05/10/2026");
    expect(dateHeureCs("2026-10-05", "")).toBe("05/10/2026");
  });
  it("sans date, rien (l'heure seule n'a pas de sens)", () => {
    expect(dateHeureCs(undefined, "18:30")).toBeUndefined();
  });
});

describe("dateSeuleCs / dateCourteOdj", () => {
  it("retire l'heure d'une valeur d'en-tete", () => {
    expect(dateSeuleCs("05/10/2026 à 18h30")).toBe("05/10/2026");
    expect(dateSeuleCs("à planifier")).toBe("à planifier");
  });
  it("formate une date ISO, undefined si absente", () => {
    expect(dateCourteOdj("2026-12-31")).toBe("31/12/2026");
    expect(dateCourteOdj(undefined)).toBeUndefined();
  });
});

describe("ODJ rempli (Word / PDF) - date du CS avec heure", () => {
  const odj: Odj = {
    copro: { code: "S146", nom: "Les Marronniers", adresse: "12 rue des Lilas" },
    enTete: [{ id: "date-cs", libelle: "Date du CS", source: "supabase", valeur: "05/10/2026 à 18h30" }],
    sections: [],
    pointsLegaux: [],
  };
  it("l'encadre reunion montre l'heure", () => {
    const ligne = arbreOdj(odj).reunion[0];
    expect(ligne).toMatchObject({ libelle: "Conseil syndical du", valeur: "05/10/2026 à 18h30" });
  });
  it("le nom de fichier reste date seule, en ISO", () => {
    expect(nomFichierOdjRempli(odj)).toBe("ODJ rempli - S146 - 2026-10-05");
  });
});
