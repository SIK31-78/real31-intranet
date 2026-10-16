// REA-344 (16/10/2026) : le bouton « Fixer » demande l'ouverture de l'editeur de la date
// par un evenement de fenetre. Pas de DOM dans la suite : un EventTarget tient lieu de
// fenetre, c'est le contrat de l'evenement qu'on verifie.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EVENEMENT_OUVRIR_EDITEUR_DATE,
  demanderOuvertureDate,
  type DemandeOuvertureDate,
} from "./editeur-date.utils";

const DEMANDE: DemandeOuvertureDate = { coproCode: "S191", type: "ag", quand: "prochaine" };

beforeEach(() => {
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("demanderOuvertureDate", () => {
  it("transmet la demande et rend true quand un editeur la prend", () => {
    const recues: DemandeOuvertureDate[] = [];
    window.addEventListener(EVENEMENT_OUVRIR_EDITEUR_DATE, (ev) => {
      recues.push((ev as CustomEvent<DemandeOuvertureDate>).detail);
      ev.preventDefault();
    });
    expect(demanderOuvertureDate(DEMANDE)).toBe(true);
    expect(recues).toEqual([DEMANDE]);
  });

  it("rend false quand aucun editeur ne repond (l'appelant garde son repli)", () => {
    window.addEventListener(EVENEMENT_OUVRIR_EDITEUR_DATE, () => undefined);
    expect(demanderOuvertureDate(DEMANDE)).toBe(false);
  });
});
