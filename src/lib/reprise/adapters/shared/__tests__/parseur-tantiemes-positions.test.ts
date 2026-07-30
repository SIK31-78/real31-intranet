// Transcription deterministe des tantiemes par positions (etape 6, cause 2). Le principe
// prouve sur la compta (835 ecritures, ecart 0,00) transpose au patrimoine : le CODE
// transcrit, le modele ne recopie plus de chiffres.

import { describe, expect, it } from "vitest";
import {
  detecterColonnesTantiemes,
  parserTantiemesPositions,
} from "@/lib/reprise/adapters/shared/parseur-tantiemes-positions";
import type { ItemTexte, PageTexte } from "@/lib/reprise/adapters/shared/pdf-texte";

const item = (chaine: string, x: number, y: number, largeur = 20): ItemTexte => ({ x, y, largeur, chaine });

/** Construit une page : les y DECROISSENT vers le bas (origine PDF en bas a gauche). */
function page(lignes: { y: number; items: ItemTexte[] }[]): PageTexte {
  return {
    largeur: 595,
    hauteur: 842,
    lignes,
    nbItems: lignes.reduce((s, l) => s + l.items.length, 0),
  };
}

const COL_LOT = 100;
const COL_TANT = 300;
const entete = (y: number) => ({ y, items: [item("N° de lot", COL_LOT, y), item("Tantièmes", COL_TANT, y)] });
const ligneLot = (y: number, lot: number, valeur: number) => ({
  y,
  items: [item(String(lot), COL_LOT, y), item(String(valeur), COL_TANT, y)],
});

describe("detecterColonnesTantiemes", () => {
  it("repere les colonnes par leurs en-tetes imprimes", () => {
    const c = detecterColonnesTantiemes(page([entete(800)]));
    expect(c).not.toBeNull();
    expect(c!.lotX).toBeCloseTo(COL_LOT + 10);
    expect(c!.tantiemeX).toBeCloseTo(COL_TANT + 10);
  });

  it("accepte les variantes de libelle (milliemes, quote-part)", () => {
    for (const libelle of ["Millièmes", "Quotes-parts"]) {
      const p = page([{ y: 800, items: [item("Lot n°", COL_LOT, 800), item(libelle, COL_TANT, 800)] }]);
      expect(detecterColonnesTantiemes(p)).not.toBeNull();
    }
  });

  it("ne DEVINE PAS une mise en page inconnue : null plutot qu'un pari", () => {
    const p = page([{ y: 800, items: [item("Designation", 100, 800), item("Surface", 300, 800)] }]);
    expect(detecterColonnesTantiemes(p)).toBeNull();
  });

  it("ne confond pas 'quote-part de lot' avec la colonne des lots", () => {
    // Le tantieme est teste d'abord, sinon "quote-part de lot" volerait la colonne lot.
    const p = page([
      { y: 800, items: [item("N° de lot", COL_LOT, 800), item("Quote-part de lot", COL_TANT, 800)] },
    ]);
    const c = detecterColonnesTantiemes(p)!;
    expect(c.tantiemeX).toBeCloseTo(COL_TANT + 10);
    expect(c.lotX).toBeCloseTo(COL_LOT + 10);
  });
});

describe("parserTantiemesPositions", () => {
  it("transcrit un tableau simple et son total imprime", () => {
    const r = parserTantiemesPositions([
      page([entete(800), ligneLot(780, 1, 153), ligneLot(760, 2, 153), {
        y: 740,
        items: [item("Total", COL_LOT, 740), item("306", COL_TANT, 740)],
      }]),
    ]);
    expect(r.lignes).toEqual([
      { lot: 1, valeur: 153 },
      { lot: 2, valeur: 153 },
    ]);
    expect(r.totalImprime).toBe(306);
    expect(r.pagesNonLues).toEqual([]);
  });

  it("lit les nombres a separateur de milliers", () => {
    const r = parserTantiemesPositions([page([entete(800), ligneLot(780, 5, 0), {
      y: 780,
      items: [item("5", COL_LOT, 780), item("1 234", COL_TANT, 780)],
    }])]);
    expect(r.lignes).toEqual([{ lot: 5, valeur: 1234 }]);
  });

  it("ignore ce qui est AU-DESSUS de l'en-tete (titre, references)", () => {
    const r = parserTantiemesPositions([
      page([
        { y: 820, items: [item("999", COL_LOT, 820), item("777", COL_TANT, 820)] }, // au-dessus
        entete(800),
        ligneLot(780, 1, 153),
      ]),
    ]);
    expect(r.lignes).toEqual([{ lot: 1, valeur: 153 }]);
  });

  it("recolle plusieurs pages et redetecte les colonnes PAGE PAR PAGE", () => {
    const r = parserTantiemesPositions([
      page([entete(800), ligneLot(780, 1, 100)]),
      page([entete(800), ligneLot(780, 2, 200)]),
    ]);
    expect(r.lignes).toEqual([
      { lot: 1, valeur: 100 },
      { lot: 2, valeur: 200 },
    ]);
  });

  it("SIGNALE une page illisible au lieu de l'ignorer (elle alimente le refus §3bis)", () => {
    const r = parserTantiemesPositions([
      page([entete(800), ligneLot(780, 1, 100)]),
      page([{ y: 800, items: [item("scan sans en-tete", 100, 800)] }]),
    ]);
    expect(r.lignes).toEqual([{ lot: 1, valeur: 100 }]);
    expect(r.pagesNonLues).toEqual([2]);
  });

  it("n'additionne pas un lot vu deux fois (en-tete repete, page dupliquee)", () => {
    const r = parserTantiemesPositions([
      page([entete(800), ligneLot(780, 1, 153)]),
      page([entete(800), ligneLot(780, 1, 153)]),
    ]);
    expect(r.lignes).toEqual([{ lot: 1, valeur: 153 }]);
  });

  it("garde le PLUS GRAND total : un sous-total de page ne masque pas le total general", () => {
    const r = parserTantiemesPositions([
      page([entete(800), ligneLot(780, 1, 100), { y: 760, items: [item("Sous-total", COL_LOT, 760), item("100", COL_TANT, 760)] }]),
      page([entete(800), ligneLot(780, 2, 900), { y: 760, items: [item("Total général", COL_LOT, 760), item("1000", COL_TANT, 760)] }]),
    ]);
    expect(r.totalImprime).toBe(1000);
  });

  it("ecarte les cellules non numeriques sans casser la ligne suivante", () => {
    const r = parserTantiemesPositions([
      page([
        entete(800),
        { y: 780, items: [item("n/a", COL_LOT, 780), item("-", COL_TANT, 780)] },
        ligneLot(760, 3, 153),
      ]),
    ]);
    expect(r.lignes).toEqual([{ lot: 3, valeur: 153 }]);
  });
});
