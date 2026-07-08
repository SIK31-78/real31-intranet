// Tests du registre des ressources reservables (increment 4). Domaine PUR : liste
// fermee + helpers, parsing de l'availabilityView Graph, construction des attendees
// "resource". Aucun reseau, aucun mock.

import { describe, expect, it } from "vitest";
import {
  RESSOURCES_REAL31,
  sallesReunion,
  vehicules,
  ressourceParEmail,
  attendeesRessource,
  interpreterAvailabilityView,
} from "./salles-reunion";

describe("registre RESSOURCES_REAL31", () => {
  it("contient exactement les 7 ressources attendues", () => {
    expect(RESSOURCES_REAL31.map((r) => r.email)).toEqual([
      "real31lgc@real31.fr",
      "real31lgc2eme@real31.fr",
      "real31lgccuisine@real31.fr",
      "real31JF@real31.fr",
      "REAL.31.HLS@real31.fr",
      "REAL31ML@real31.fr",
      "zoe@real31.fr",
    ]);
  });

  it("sallesReunion() renvoie les 6 salles (type salle) et pas la ZOE", () => {
    const salles = sallesReunion();
    expect(salles).toHaveLength(6);
    expect(salles.every((s) => s.type === "salle")).toBe(true);
    expect(salles.some((s) => s.email === "zoe@real31.fr")).toBe(false);
  });

  it("vehicules() renvoie la seule ZOE (type vehicule)", () => {
    const v = vehicules();
    expect(v).toHaveLength(1);
    expect(v[0]?.email).toBe("zoe@real31.fr");
    expect(v[0]?.type).toBe("vehicule");
  });

  it("marque la cuisine LGC comme salle de debordement", () => {
    const cuisine = ressourceParEmail("real31lgccuisine@real31.fr");
    expect(cuisine?.debordement).toBe(true);
    expect(cuisine?.agence).toBe("LGC");
  });

  it("ressourceParEmail est insensible a la casse et rejette les emails hors liste", () => {
    expect(ressourceParEmail("REAL31LGC@REAL31.FR")?.email).toBe("real31lgc@real31.fr");
    expect(ressourceParEmail("  real31JF@real31.fr ")?.type).toBe("salle");
    expect(ressourceParEmail("intrus@real31.fr")).toBeUndefined();
    expect(ressourceParEmail("")).toBeUndefined();
    expect(ressourceParEmail(null)).toBeUndefined();
  });
});

describe("interpreterAvailabilityView", () => {
  it("tout a zero -> libre", () => {
    expect(interpreterAvailabilityView("0000")).toBe("libre");
    expect(interpreterAvailabilityView("")).toBe("libre");
  });

  it("un caractere non-zero -> occupee", () => {
    expect(interpreterAvailabilityView("0200")).toBe("occupee");
    expect(interpreterAvailabilityView("2")).toBe("occupee");
    expect(interpreterAvailabilityView("0001")).toBe("occupee"); // tentative compte aussi
  });
});

describe("attendeesRessource", () => {
  it("construit un attendee 'resource' par email non vide", () => {
    expect(attendeesRessource(["real31lgc@real31.fr", "zoe@real31.fr"])).toEqual([
      { type: "resource", emailAddress: { address: "real31lgc@real31.fr" } },
      { type: "resource", emailAddress: { address: "zoe@real31.fr" } },
    ]);
  });

  it("ignore les entrees vides / blanches", () => {
    expect(attendeesRessource(["", "  ", "real31JF@real31.fr"])).toEqual([
      { type: "resource", emailAddress: { address: "real31JF@real31.fr" } },
    ]);
    expect(attendeesRessource([])).toEqual([]);
  });
});
