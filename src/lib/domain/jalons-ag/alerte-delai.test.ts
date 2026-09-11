// Tests de l'alerte "delai court" a la pose d'une date de prochaine AG (Sekou 2026-07-28).
// Les seuils NE SONT PAS des constantes locales : ils viennent des jalons cabinet
// (ODJ_CS J-45, mise sous pli J-31 avec plancher legal J-22). Ces tests verrouillent donc
// aussi le fait qu'on lit bien ces jalons-la, et pas des nombres reinventes a cote.

import { describe, expect, it } from "vitest";
import { alerteDelaiAg } from "./alerte-delai";

// AG de reference : jeudi 15 octobre 2026. Jalons attendus (verifies a la main) :
//   ODJ_CS  = J-45 = lundi 31 aout 2026
//   CONVOC  = J-31 = lundi 14 septembre 2026 (cabinet, plus contraignant que le legal
//             J-22 = 23 septembre ; lundi = deja un jour ouvre, pas de recul)
const AG = "2026-10-15";
const ODJ_CS = "2026-08-31";
const CONVOC = "2026-09-14";

describe("alerteDelaiAg", () => {
  it("ne dit rien quand le delai est confortable", () => {
    expect(alerteDelaiAg(AG, "2026-08-01")).toBeNull(); // 75 jours avant
  });

  it("ne dit rien pile a l'echeance du CS (J-45) : le delai tient encore", () => {
    expect(alerteDelaiAg(AG, ODJ_CS)).toBeNull();
  });

  it("passe en 'court' des le lendemain de l'echeance du CS (J-44)", () => {
    const a = alerteDelaiAg(AG, "2026-09-01");
    expect(a).not.toBeNull();
    expect(a!.niveau).toBe("court");
    expect(a!.joursAvant).toBe(44);
    expect(a!.semainesAvant).toBe(6);
    expect(a!.odjCsDepasse).toBe(true); // le CS aurait du etre tenu
    expect(a!.convocDepassee).toBe(false); // la convocation peut encore partir
  });

  it("expose les cibles reelles des jalons cabinet, pas des dates recalculees", () => {
    const a = alerteDelaiAg(AG, "2026-09-01")!;
    expect(a.odjCsISO).toBe(ODJ_CS);
    expect(a.convocISO).toBe(CONVOC);
  });

  it("reste 'court' la veille de la mise sous pli", () => {
    const a = alerteDelaiAg(AG, "2026-09-13")!;
    expect(a.niveau).toBe("court");
    expect(a.convocDepassee).toBe(false);
  });

  it("bascule en 'critique' le jour de la mise sous pli : la convocation ne part plus a temps", () => {
    const a = alerteDelaiAg(AG, CONVOC)!;
    expect(a.niveau).toBe("critique");
    expect(a.joursAvant).toBe(31);
    expect(a.convocDepassee).toBe(true);
    expect(a.odjCsDepasse).toBe(true);
  });

  it("reste 'critique' pour une AG dans trois semaines", () => {
    const a = alerteDelaiAg(AG, "2026-09-24")!; // 21 jours avant
    expect(a.niveau).toBe("critique");
    expect(a.semainesAvant).toBe(3);
  });

  it("se tait le jour meme et pour une date passee (avertissementDateReunion parle deja)", () => {
    expect(alerteDelaiAg(AG, AG)).toBeNull();
    expect(alerteDelaiAg(AG, "2026-10-20")).toBeNull();
  });

  it("se tait sur une date malformee plutot que de jeter", () => {
    expect(alerteDelaiAg("", "2026-09-01")).toBeNull();
    expect(alerteDelaiAg("15/10/2026", "2026-09-01")).toBeNull();
    expect(alerteDelaiAg(AG, "pas-une-date")).toBeNull();
  });

  it("traverse un changement d'annee et recule la mise sous pli au jour ouvre", () => {
    // AG le mercredi 20 janvier 2027 -> ODJ_CS a J-45 = dimanche 6 decembre 2026 (le CS
    // n'est pas recale : c'est une cible de preparation, pas un acte a poster).
    // Mise sous pli a J-31 = dimanche 20 decembre 2026 -> reculee au vendredi 18, parce
    // qu'on ne met pas sous pli un dimanche. C'est calculerJalons qui l'applique : cette
    // alerte en herite au lieu de recalculer une date naive.
    const a = alerteDelaiAg("2027-01-20", "2026-12-10")!;
    expect(a.joursAvant).toBe(41);
    expect(a.odjCsISO).toBe("2026-12-06");
    expect(a.convocISO).toBe("2026-12-18");
    expect(a.niveau).toBe("court");
  });
});
