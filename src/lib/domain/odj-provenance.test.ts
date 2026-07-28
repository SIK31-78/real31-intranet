// Tests du badge de provenance d'un champ d'ODJ (Sekou 2026-07-28 : "beaucoup de boutons
// qui sont deja auto mais sont comme 'a venir'"). La regle tranche sur la PRESENCE d'une
// valeur, pas sur la source declaree -- sinon un champ Estale deja alimente ment a l'ecran.

import { describe, expect, it } from "vitest";
import { provenanceChamp, type ChampOdj } from "./odj";

const champ = (p: Partial<ChampOdj>): ChampOdj => ({
  id: "x",
  libelle: "X",
  source: "manuel",
  ...p,
});

describe("provenanceChamp", () => {
  it("dit 'auto' pour un champ Estale DEJA alimente (le bug signale)", () => {
    expect(provenanceChamp(champ({ source: "estale", valeur: "4500" }))).toBe("auto");
  });

  it("dit 'a venir' pour un champ Estale encore vide", () => {
    expect(provenanceChamp(champ({ source: "estale" }))).toBe("a-venir");
  });

  it("dit 'saisi' des que le gestionnaire a tape la valeur, quelle que soit la source", () => {
    expect(provenanceChamp(champ({ source: "estale", valeur: "12", saisi: true }))).toBe("saisi");
    expect(provenanceChamp(champ({ source: "supabase", valeur: "12", saisi: true }))).toBe("saisi");
    expect(provenanceChamp(champ({ source: "manuel", valeur: "12", saisi: true }))).toBe("saisi");
  });

  it("distingue un referentiel renseigne d'un referentiel muet", () => {
    expect(provenanceChamp(champ({ source: "supabase", valeur: "31 rue X" }))).toBe("auto");
    expect(provenanceChamp(champ({ source: "supabase" }))).toBe("a-saisir");
  });

  it("garde les provenances calculees inchangees", () => {
    expect(provenanceChamp(champ({ source: "jalon", valeur: "12/09/2026" }))).toBe("auto-jalon");
    expect(provenanceChamp(champ({ source: "calcul", valeur: "-320" }))).toBe("calcul");
  });

  it("laisse un champ manuel vide en 'a saisir'", () => {
    expect(provenanceChamp(champ({ source: "manuel" }))).toBe("a-saisir");
  });
});
