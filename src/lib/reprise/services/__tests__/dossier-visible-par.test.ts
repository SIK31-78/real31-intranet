// Qui voit quelle reprise (demande Sekou, 08/10/2026).
//
// Le module s'ouvre aux gestionnaires : chacun ne voit que les copropriétés dont il est
// le gestionnaire nommé. Avant, l'écran listait toutes les reprises du cabinet — ce qui
// ne se voyait pas, faute d'entrée de menu pour les non-super-admins.
//
// Ce test garde la règle : c'est elle qui empêche un gestionnaire d'ouvrir la reprise
// d'un collègue en devinant l'URL.

import { describe, expect, it } from "vitest";
import type { Dossier, Etape } from "@/lib/reprise/domain/dossier";
import { dossierVisiblePar } from "../resume-dossier";

const CHRYSTELLE = { id: "u-chrystelle", nom: "Chrystelle BOUCHAUD" };
const REMI = { id: "u-remi", nom: "Rémi BARD" };
const ELSA = { id: "u-elsa", nom: "Elsa PEIXOTO" };

function etape(code: string, assigneA?: { id: string; nom: string }): Etape {
  return { code, phase: "CADRAGE", libelle: code, statut: "a_faire", ...(assigneA ? { assigneA } : {}) };
}

function dossier(surcharges: Partial<Dossier> = {}): Dossier {
  return {
    ref: "S307",
    nomUsuel: "12 rue Daniel",
    statut: "production",
    etapes: [etape("CA1"), etape("CA2")],
    ...surcharges,
  } as Dossier;
}

describe("dossierVisiblePar", () => {
  it("le gestionnaire nommé voit son dossier", () => {
    const d = dossier({ equipe: { gestionnaire: CHRYSTELLE } });
    expect(dossierVisiblePar(d, CHRYSTELLE.id, false)).toBe(true);
  });

  it("un autre gestionnaire ne le voit pas", () => {
    const d = dossier({ equipe: { gestionnaire: CHRYSTELLE } });
    expect(dossierVisiblePar(d, REMI.id, false)).toBe(false);
  });

  it("une étape assignée suffit : un assistant doit pouvoir faire son travail", () => {
    const d = dossier({
      equipe: { gestionnaire: CHRYSTELLE },
      etapes: [etape("CA1"), etape("CA2", ELSA)],
    });
    expect(dossierVisiblePar(d, ELSA.id, false)).toBe(true);
  });

  it("la direction et les managers voient tout, y compris les dossiers sans équipe", () => {
    expect(dossierVisiblePar(dossier(), REMI.id, true)).toBe(true);
    expect(dossierVisiblePar(dossier({ equipe: { gestionnaire: CHRYSTELLE } }), REMI.id, true)).toBe(true);
  });

  it("un dossier sans équipe ni assignation n'est visible que de la direction", () => {
    expect(dossierVisiblePar(dossier(), CHRYSTELLE.id, false)).toBe(false);
  });

  it("être gestionnaire d'UN dossier n'ouvre pas celui d'à côté", () => {
    const sien = dossier({ ref: "S307", equipe: { gestionnaire: CHRYSTELLE } });
    const autre = dossier({ ref: "S306", equipe: { gestionnaire: REMI } });
    expect(dossierVisiblePar(sien, CHRYSTELLE.id, false)).toBe(true);
    expect(dossierVisiblePar(autre, CHRYSTELLE.id, false)).toBe(false);
  });

  it("un autre rôle de l'équipe (comptable) ne suffit pas sans étape assignée", () => {
    // Choix assumé : la demande porte sur le gestionnaire. Le comptable voit le dossier
    // dès qu'une étape lui est confiée, ce qui est le cas en pratique.
    const d = dossier({ equipe: { gestionnaire: CHRYSTELLE, comptable: ELSA } });
    expect(dossierVisiblePar(d, ELSA.id, false)).toBe(false);
  });
});
