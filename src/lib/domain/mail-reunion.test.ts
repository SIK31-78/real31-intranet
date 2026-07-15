// Tests du modele de mail au conseil syndical (increment 2 "dates CS/AG"). Fonctions
// PURES : composition de l'objet + du corps selon le type (CS/AG) et les infos de reunion.
// Aucun envoi reel. Pas de vraie adresse (PII).

import { describe, it, expect } from "vitest";
import { objetMailReunion, corpsMailReunion, type InfosMailReunion } from "./mail-reunion";

const BASE: InfosMailReunion = {
  type: "CS",
  coproCode: "S46",
  coproNom: "Résidence Les Acacias",
  dateISO: "2026-09-15",
  heure: "18:00",
  confirme: false,
};

describe("objetMailReunion", () => {
  it("CS avec heure -> reference + libelle + date FR + heure", () => {
    expect(objetMailReunion(BASE)).toBe("S46 - Conseil syndical du 15/09/2026 à 18h00");
  });

  it("AG utilise 'Assemblée générale'", () => {
    expect(objetMailReunion({ ...BASE, type: "AG" })).toBe(
      "S46 - Assemblée générale du 15/09/2026 à 18h00",
    );
  });

  it("sans heure -> s'arrete a la date", () => {
    const sansHeure: InfosMailReunion = { ...BASE, heure: undefined };
    expect(objetMailReunion(sansHeure)).toBe("S46 - Conseil syndical du 15/09/2026");
  });
});

describe("corpsMailReunion", () => {
  it("CS non confirme : mentionne la date a confirmer + demande de presence, sans salle", () => {
    const c = corpsMailReunion(BASE);
    expect(c).toContain("Résidence Les Acacias (S46)");
    expect(c).toContain("le 15 septembre 2026 à 18h00");
    expect(c).toContain("à confirmer par le conseil syndical");
    expect(c).toContain("confirmer votre présence");
    expect(c).not.toContain("Lieu de la réunion");
    // Pas de convocation officielle pour un CS.
    expect(c).not.toContain("convocation officielle");
  });

  it("CS confirme : pas de mention 'a confirmer'", () => {
    const c = corpsMailReunion({ ...BASE, confirme: true });
    expect(c).not.toContain("à confirmer");
  });

  it("avec salle reservee : ajoute le lieu", () => {
    const c = corpsMailReunion({ ...BASE, salleLibelle: "LGC - Salle de reunions" });
    expect(c).toContain("Lieu de la réunion : LGC - Salle de reunions.");
  });

  it("AG : mentionne la convocation officielle et l'ordre du jour", () => {
    const c = corpsMailReunion({ ...BASE, type: "AG", confirme: true });
    expect(c).toContain("assemblée générale");
    expect(c).toContain("convocation officielle");
    expect(c).toContain("ordre du jour");
  });

  it("sans heure : formule 'le <date>' sans heure", () => {
    const sansHeure: InfosMailReunion = { ...BASE, heure: undefined };
    const c = corpsMailReunion(sansHeure);
    expect(c).toContain("le 15 septembre 2026.");
    expect(c).not.toContain("à 18h00");
  });
});
