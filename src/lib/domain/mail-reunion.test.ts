// Tests du modele de mail au conseil syndical (increment 2 "dates CS/AG"). Fonctions
// PURES : composition de l'objet + du corps qui PROPOSE les dates de CS et d'AG.
// Aucun envoi reel. Pas de vraie adresse (PII).

import { describe, it, expect } from "vitest";
import {
  objetMailDatesReunion,
  corpsMailDatesReunion,
  dateConfirmationJ7,
  type InfosMailDatesReunion,
} from "./mail-reunion";

const BASE: InfosMailDatesReunion = {
  coproCode: "S46",
  coproNom: "Résidence Les Acacias",
  cs: { dateISO: "2026-09-08", heure: "18:00" },
  ag: { dateISO: "2026-09-15", heure: "18:30" },
  dateConfirmationISO: "2026-07-22",
};

describe("dateConfirmationJ7", () => {
  it("ajoute 7 jours (meme mois)", () => {
    expect(dateConfirmationJ7("2026-07-15")).toBe("2026-07-22");
  });
  it("gere le passage de mois", () => {
    expect(dateConfirmationJ7("2026-07-28")).toBe("2026-08-04");
  });
});

describe("objetMailDatesReunion", () => {
  it("deux dates -> 'Dates de CS et d'AG à fixer'", () => {
    expect(objetMailDatesReunion(BASE)).toBe("S46 - Dates de CS et d'AG à fixer");
  });
  it("CS seul -> 'Date de CS à fixer'", () => {
    expect(objetMailDatesReunion({ ...BASE, ag: undefined })).toBe("S46 - Date de CS à fixer");
  });
  it("AG seule -> 'Date d'AG à fixer'", () => {
    expect(objetMailDatesReunion({ ...BASE, cs: undefined })).toBe("S46 - Date d'AG à fixer");
  });
});

describe("corpsMailDatesReunion", () => {
  it("deux dates : intro combinee + les deux lignes avec dates/heures FR", () => {
    const c = corpsMailDatesReunion(BASE);
    expect(c).toContain("Bonjour à tous,");
    expect(c).toContain("fixer dès à présent les dates de CS et d'AG.");
    expect(c).toContain("- pour la tenue du CS préparatoire le 08/09/2026 à 18h00");
    expect(c).toContain("- pour l'assemblée le 15/09/2026 à 18h30");
    expect(c).toContain("Sauf avis contraire nous confirmerons la date le 22/07/2026.");
    expect(c).toContain("me faire part des éventuels sujets à mettre à l'ordre du jour");
    expect(c).toContain("Cordialement,");
  });

  it("CS seul : intro adaptee + une seule ligne (pas de ligne AG)", () => {
    const c = corpsMailDatesReunion({ ...BASE, ag: undefined });
    expect(c).toContain("fixer dès à présent la date du CS préparatoire.");
    expect(c).toContain("- pour la tenue du CS préparatoire le 08/09/2026");
    expect(c).not.toContain("- pour l'assemblée");
  });

  it("AG seule : intro adaptee + une seule ligne (pas de ligne CS)", () => {
    const c = corpsMailDatesReunion({ ...BASE, cs: undefined });
    expect(c).toContain("fixer dès à présent la date de l'assemblée générale.");
    expect(c).toContain("- pour l'assemblée le 15/09/2026");
    expect(c).not.toContain("- pour la tenue du CS préparatoire");
  });

  it("heure absente -> 18h00 par defaut", () => {
    const c = corpsMailDatesReunion({
      ...BASE,
      cs: { dateISO: "2026-09-08" },
      ag: undefined,
    });
    expect(c).toContain("le 08/09/2026 à 18h00");
  });

  it("mode present -> parenthese verbatim ; hybride explicite", () => {
    const c = corpsMailDatesReunion({
      ...BASE,
      cs: { dateISO: "2026-09-08", heure: "18:00", mode: "visio" },
      ag: { dateISO: "2026-09-15", heure: "18:30", mode: "hybride" },
    });
    expect(c).toContain("le 08/09/2026 à 18h00 (en visio)");
    expect(c).toContain("le 15/09/2026 à 18h30 (en hybride visio + présentiel)");
  });

  it("mode absent -> aucune parenthese (on n'invente rien)", () => {
    const c = corpsMailDatesReunion({ ...BASE, cs: undefined });
    expect(c).toContain("le 15/09/2026 à 18h30");
    expect(c).not.toContain("(en ");
  });

  it("salle mentionnee en presentiel ; ignoree en visio", () => {
    const enPresentiel = corpsMailDatesReunion({
      ...BASE,
      cs: undefined,
      ag: {
        dateISO: "2026-09-15",
        heure: "18:30",
        mode: "presentiel",
        salleLibelle: "LGC - Salle de reunions",
      },
    });
    expect(enPresentiel).toContain("(en présentiel), salle LGC - Salle de reunions");

    const enVisio = corpsMailDatesReunion({
      ...BASE,
      cs: undefined,
      ag: {
        dateISO: "2026-09-15",
        heure: "18:30",
        mode: "visio",
        salleLibelle: "LGC - Salle de reunions",
      },
    });
    expect(enVisio).not.toContain("salle LGC");
  });
});
