// Regle de reprise de l'heure de fin du CS dans la facturation (Sekou 2026-07-28).
//
// Le point delicat n'est pas de STOCKER l'heure de fin, c'est de savoir QUAND on a le
// droit de la reprendre : la confirmation porte une DATE. Si le CS a ete replanifie
// depuis, l'heure de fin appartient a une autre seance et ne doit pas fuiter dans la
// facturation d'un depassement -- on facturerait des heures qui n'ont pas eu lieu.

import { describe, expect, it } from "vitest";
import type { ConfirmationEvenement } from "./confirmation-evenement";

/** Meme regle que creneauCsDeLaCopro : l'heure de fin ne vaut que pour SA date. */
function finReprise(
  confirmation: ConfirmationEvenement | undefined,
  jourDuCs: string,
): string | undefined {
  return confirmation?.date === jourDuCs ? confirmation.heureFin : undefined;
}

const conf = (p: Partial<ConfirmationEvenement>): ConfirmationEvenement => ({
  coproCode: "SE999",
  type: "CS",
  date: "2026-08-05",
  statut: "confirme",
  ...p,
});

describe("reprise de l'heure de fin du CS", () => {
  it("reprend l'heure de fin quand elle porte bien sur le CS du jour", () => {
    expect(finReprise(conf({ heureFin: "20:30" }), "2026-08-05")).toBe("20:30");
  });

  it("REFUSE l'heure de fin d'une seance replanifiee depuis", () => {
    // CS confirme le 05/08 a 20h30, puis deplace au 12/08 : l'heure du 05 ne doit pas
    // servir a facturer le 12 (on facturerait des heures qui n'ont pas eu lieu).
    expect(finReprise(conf({ heureFin: "20:30" }), "2026-08-12")).toBeUndefined();
  });

  it("ne suppose aucune heure quand la confirmation n'en porte pas", () => {
    expect(finReprise(conf({}), "2026-08-05")).toBeUndefined();
  });

  it("ne suppose aucune heure sans confirmation du tout", () => {
    expect(finReprise(undefined, "2026-08-05")).toBeUndefined();
  });
});
