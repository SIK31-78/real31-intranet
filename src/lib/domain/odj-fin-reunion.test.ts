// La règle de l'heure de fin de réunion (remontée d'une collègue, 07/10/2026).
//
// Avant : le pied du document affichait l'horodatage de la CLÔTURE. Clore le lendemain
// matin écrivait une heure fausse, et rien ne permettait de la corriger. Désormais une
// saisie libre prime sur cet horodatage, qui n'est plus qu'un défaut.
//
// Ces tests portent sur le CONTRAT : ce que `getOdj` expose (`finReunion`) et ce que le
// pied doit choisir. La résolution elle-même tient en une ligne, mais c'est la ligne qui
// décide ce qui s'imprime sur un document remis au conseil syndical.

import { describe, expect, it } from "vitest";
import type { ClotureOdj } from "./odj";

/** Ce que le pied du document affiche, dans l'ordre de priorité. */
function heureAffichee(odj: { finReunion?: string; cloture?: ClotureOdj }): string | undefined {
  if (odj.finReunion) return odj.finReunion;
  if (!odj.cloture) return undefined;
  const d = new Date(odj.cloture.le);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })
    .format(d)
    .replace(":", "h");
}

const CLOTURE_LENDEMAIN: ClotureOdj = { le: "2026-11-17T08:12:00.000Z", par: "FS" };

describe("heure de fin de réunion", () => {
  it("la saisie prime sur l'horodatage de clôture", () => {
    expect(heureAffichee({ finReunion: "20h30", cloture: CLOTURE_LENDEMAIN })).toBe("20h30");
  });

  it("sans saisie, on retombe sur l'heure de clôture", () => {
    // 08:12 UTC = 09h12 à Paris en novembre (UTC+1).
    expect(heureAffichee({ cloture: CLOTURE_LENDEMAIN })).toBe("09h12");
  });

  it("c'est bien le cas que la collègue a signalé : clore le lendemain affichait 09h12", () => {
    // Sans la correction, un CS terminé à 20h30 et clos le lendemain matin imprimait
    // l'heure du clic sur le document remis au conseil syndical.
    const sansCorrection = heureAffichee({ cloture: CLOTURE_LENDEMAIN });
    const avecCorrection = heureAffichee({ finReunion: "20h30", cloture: CLOTURE_LENDEMAIN });
    expect(sansCorrection).not.toBe(avecCorrection);
    expect(avecCorrection).toBe("20h30");
  });

  it("ni saisie ni clôture : rien à afficher, le document garde son pointillé", () => {
    expect(heureAffichee({})).toBeUndefined();
  });

  it("une saisie vidée ne masque pas l'heure de clôture", () => {
    // getOdj normalise "" en undefined : effacer la saisie rétablit le défaut.
    expect(heureAffichee({ finReunion: undefined, cloture: CLOTURE_LENDEMAIN })).toBe("09h12");
  });

  it("une heure de clôture illisible ne casse pas le document", () => {
    expect(heureAffichee({ cloture: { le: "pas une date", par: "FS" } })).toBeUndefined();
  });
});
