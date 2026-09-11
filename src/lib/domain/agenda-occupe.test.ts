// L'agenda occupe affiche en fond du calendrier AG/CS. Ces tests verrouillent les trois
// pieges du regroupement : ce qui traverse minuit, ce qui se chevauche, et la fenetre
// qu'on accepte d'interroger.

import { describe, expect, it } from "vitest";
import {
  bornerPeriodeAgenda,
  grouperPlagesParJour,
  libelleJourOccupe,
  MAX_JOURS_AGENDA,
  type Plage,
} from "./agenda-occupe";

const plage = (debut: string, fin: string, journeeEntiere = false): Plage => ({
  debut,
  fin,
  journeeEntiere,
});

describe("bornerPeriodeAgenda", () => {
  it("passe une periode normale telle quelle, avec la borne haute au lendemain", () => {
    expect(bornerPeriodeAgenda("2026-09-01", "2026-09-30")).toEqual({
      du: "2026-09-01",
      au: "2026-09-30",
      auExclusif: "2026-10-01",
    });
  });

  it("tronque une fenetre trop large plutot que d'interroger Graph dessus", () => {
    const p = bornerPeriodeAgenda("2026-09-01", "2027-09-01")!;
    expect(p.au).toBe("2026-10-12"); // 42 jours a partir du 1er septembre
  });

  it("accepte une grille de mois complete (6 semaines) sans la tronquer", () => {
    const p = bornerPeriodeAgenda("2026-08-31", "2026-10-11")!; // 42 jours pile
    expect(p.au).toBe("2026-10-11");
    expect(MAX_JOURS_AGENDA).toBe(42);
  });

  it("refuse une periode a l'envers ou illisible", () => {
    expect(bornerPeriodeAgenda("2026-09-30", "2026-09-01")).toBeNull();
    expect(bornerPeriodeAgenda("01/09/2026", "2026-09-30")).toBeNull();
    expect(bornerPeriodeAgenda("", "")).toBeNull();
  });
});

describe("grouperPlagesParJour", () => {
  const DU = "2026-09-01";
  const AU = "2026-09-30";

  it("range un rendez-vous simple sur son jour", () => {
    const j = grouperPlagesParJour([plage("2026-09-14T09:00:00", "2026-09-14T10:30:00")], DU, AU);
    expect(j).toHaveLength(1);
    expect(j[0]).toMatchObject({
      date: "2026-09-14",
      creneaux: [{ debut: "09:00", fin: "10:30" }],
      minutes: 90,
      journeeEntiere: false,
    });
  });

  it("FUSIONNE les creneaux qui se chevauchent (on montre de l'occupation, pas une liste)", () => {
    const j = grouperPlagesParJour(
      [
        plage("2026-09-14T09:00:00", "2026-09-14T10:00:00"),
        plage("2026-09-14T09:30:00", "2026-09-14T11:00:00"),
      ],
      DU,
      AU,
    );
    expect(j[0]?.creneaux).toEqual([{ debut: "09:00", fin: "11:00" }]);
    expect(j[0]?.minutes).toBe(120);
  });

  it("garde separes deux creneaux qui ne se touchent pas", () => {
    const j = grouperPlagesParJour(
      [
        plage("2026-09-14T09:00:00", "2026-09-10T10:00:00"), // fin < debut : ignoree
        plage("2026-09-14T09:00:00", "2026-09-14T10:00:00"),
        plage("2026-09-14T14:00:00", "2026-09-14T15:00:00"),
      ],
      DU,
      AU,
    );
    expect(j[0]?.creneaux).toEqual([
      { debut: "09:00", fin: "10:00" },
      { debut: "14:00", fin: "15:00" },
    ]);
  });

  it("DECOUPE un conge de trois jours sur chacun de ses jours", () => {
    // Sans decoupe, le conge n'apparaitrait que le premier jour et le calendrier
    // mentirait les deux suivants.
    const j = grouperPlagesParJour(
      [plage("2026-09-14T00:00:00", "2026-09-17T00:00:00", true)],
      DU,
      AU,
    );
    expect(j.map((x) => x.date)).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
    expect(j.every((x) => x.journeeEntiere)).toBe(true);
    expect(j[0]?.minutes).toBe(1440);
  });

  it("une fin a minuit pile appartient au jour precedent (borne exclusive)", () => {
    const j = grouperPlagesParJour([plage("2026-09-14T22:00:00", "2026-09-15T00:00:00")], DU, AU);
    expect(j.map((x) => x.date)).toEqual(["2026-09-14"]);
    expect(j[0]?.creneaux).toEqual([{ debut: "22:00", fin: "24:00" }]);
  });

  it("coupe une reunion qui traverse minuit en deux jours", () => {
    const j = grouperPlagesParJour([plage("2026-09-14T22:00:00", "2026-09-15T01:00:00")], DU, AU);
    expect(j.map((x) => x.date)).toEqual(["2026-09-14", "2026-09-15"]);
    expect(j[0]?.creneaux).toEqual([{ debut: "22:00", fin: "24:00" }]);
    expect(j[1]?.creneaux).toEqual([{ debut: "00:00", fin: "01:00" }]);
  });

  it("ignore ce qui tombe hors de la fenetre demandee", () => {
    const j = grouperPlagesParJour(
      [
        plage("2026-08-25T09:00:00", "2026-08-25T10:00:00"),
        plage("2026-09-14T09:00:00", "2026-09-14T10:00:00"),
        plage("2026-10-02T09:00:00", "2026-10-02T10:00:00"),
      ],
      DU,
      AU,
    );
    expect(j.map((x) => x.date)).toEqual(["2026-09-14"]);
  });

  it("ne renvoie rien quand l'agenda est vide", () => {
    expect(grouperPlagesParJour([], DU, AU)).toEqual([]);
  });
});

describe("libelleJourOccupe", () => {
  const jour = (creneaux: { debut: string; fin: string }[], journeeEntiere = false) => ({
    date: "2026-09-14",
    creneaux,
    journeeEntiere,
    minutes: 0,
  });

  it("dit la journee entiere sans horaire (un conge n'a pas d'heure utile)", () => {
    expect(libelleJourOccupe(jour([{ debut: "00:00", fin: "24:00" }], true))).toBe("Journée prise");
  });

  it("donne le creneau quand il est seul", () => {
    expect(libelleJourOccupe(jour([{ debut: "09:00", fin: "10:30" }]))).toBe("09:00–10:30");
  });

  it("compte les autres plutot que de tous les lister (la case fait 96 px)", () => {
    expect(
      libelleJourOccupe(
        jour([
          { debut: "09:00", fin: "10:00" },
          { debut: "14:00", fin: "15:00" },
          { debut: "16:00", fin: "17:00" },
        ]),
      ),
    ).toBe("09:00–10:00 +2");
  });
});
