// Tests de l'alerte "delai court" a la pose d'une date de prochaine AG (Sekou 2026-07-28,
// retroplanning revu le 2026-09-11). Les seuils NE SONT PAS des constantes locales : ils
// viennent des jalons cabinet (ODJ_PREP J-49, ODJ_CS J-35, mise sous pli J-31 avec
// plancher legal J-22). Ces tests verrouillent donc aussi le fait qu'on lit bien ces
// jalons-la, et pas des nombres reinventes a cote.
//
// Les deux ODJ sont DISTINCTS et ne doivent jamais etre confondus :
//   ODJ_PREP = l'ODJ DU CS, prepare et envoye au conseil (J-49) ;
//   ODJ_CS   = l'ODJ DE L'AG, valide avec le conseil (J-35), qui part dans la convocation.

import { describe, expect, it } from "vitest";
import { alerteDelaiAg } from "./alerte-delai";

// AG de reference : jeudi 15 octobre 2026. Jalons attendus (verifies a la main) :
//   ODJ_PREP = J-49 = jeudi 27 aout 2026
//   ODJ_CS   = J-35 = jeudi 10 septembre 2026
//   CONVOC   = J-31 = lundi 14 septembre 2026 (cabinet, plus contraignant que le legal
//              J-22 = 23 septembre ; lundi = deja un jour ouvre, pas de recul)
const AG = "2026-10-15";
const ODJ_PREP = "2026-08-27";
const ODJ_CS = "2026-09-10";
const CONVOC = "2026-09-14";

describe("alerteDelaiAg", () => {
  it("ne dit rien quand le delai est confortable", () => {
    expect(alerteDelaiAg(AG, "2026-08-01")).toBeNull(); // 75 jours avant
  });

  it("ne dit rien pile a l'echeance de preparation de l'ODJ (J-49) : le delai tient encore", () => {
    expect(alerteDelaiAg(AG, ODJ_PREP)).toBeNull();
  });

  it("passe en 'court' des le lendemain de l'echeance de preparation (J-48)", () => {
    const a = alerteDelaiAg(AG, "2026-08-28");
    expect(a).not.toBeNull();
    expect(a!.niveau).toBe("court");
    expect(a!.joursAvant).toBe(48);
    expect(a!.semainesAvant).toBe(6);
    expect(a!.odjPrepDepasse).toBe(true); // l'ODJ du CS aurait deja du partir au conseil
    expect(a!.odjCsDepasse).toBe(false); // le conseil a encore le temps de le valider
    expect(a!.convocDepassee).toBe(false); // la convocation peut encore partir
  });

  it("signale l'ODJ de l'AG non valide une fois son echeance passee (J-34)", () => {
    const a = alerteDelaiAg(AG, "2026-09-11")!;
    expect(a.niveau).toBe("court");
    expect(a.joursAvant).toBe(34);
    expect(a.odjCsDepasse).toBe(true);
    expect(a.convocDepassee).toBe(false);
  });

  it("expose les cibles reelles des jalons cabinet, pas des dates recalculees", () => {
    const a = alerteDelaiAg(AG, "2026-09-01")!;
    expect(a.odjPrepISO).toBe(ODJ_PREP);
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
    expect(a.odjPrepDepasse).toBe(true);
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
    // AG le mercredi 20 janvier 2027 -> ODJ_PREP a J-49 = mercredi 2 decembre 2026 et
    // ODJ_CS a J-35 = mercredi 16 decembre (ni l'un ni l'autre n'est recale : ce sont des
    // cibles de preparation, pas des actes a poster).
    // Mise sous pli a J-31 = dimanche 20 decembre 2026 -> reculee au vendredi 18, parce
    // qu'on ne met pas sous pli un dimanche. C'est calculerJalons qui l'applique : cette
    // alerte en herite au lieu de recalculer une date naive.
    const a = alerteDelaiAg("2027-01-20", "2026-12-10")!;
    expect(a.joursAvant).toBe(41);
    expect(a.odjPrepISO).toBe("2026-12-02");
    expect(a.odjCsISO).toBe("2026-12-16");
    expect(a.convocISO).toBe("2026-12-18");
    expect(a.niveau).toBe("court");
  });
});
