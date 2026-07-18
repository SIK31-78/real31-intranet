// Tests de la reconstruction de lignes depuis des items positionnes SYNTHETIQUES (inventes, aucune
// vraie data, aucun reseau : on ne touche PAS a pdfjs ici, seulement la logique pure).
import { describe, expect, it } from "vitest";
import { reconstruireLignes, estPdfNatif, type ItemTexte, type PageTexte } from "../pdf-texte";

function item(x: number, y: number, largeur: number, chaine: string): ItemTexte {
  return { x, y, largeur, chaine };
}

describe("reconstruireLignes - regroupement par ligne", () => {
  it("regroupe les items de meme y (a la tolerance pres) et les ordonne par x", () => {
    const items = [
      item(300, 500, 40, "Libelle"),
      item(10, 501, 20, "VECC"), // meme ligne que 500 (ecart 1 < tolerance 3)
      item(100, 500, 30, "24/10/2025"),
      item(10, 480, 20, "AUTRE"), // ligne du dessous
    ];
    const lignes = reconstruireLignes(items);
    expect(lignes).toHaveLength(2);
    // Ligne du haut (y ~500), items tries par x : VECC, date, libelle.
    expect(lignes[0]!.items.map((i) => i.chaine)).toEqual(["VECC", "24/10/2025", "Libelle"]);
    expect(lignes[1]!.items.map((i) => i.chaine)).toEqual(["AUTRE"]);
  });

  it("ignore les items vides et gere un libelle multi-mots (items separes)", () => {
    const items = [
      item(50, 200, 10, ""), // vide -> ignore
      item(60, 200, 40, "Remboursement"),
      item(105, 200, 30, "avance"),
      item(140, 200, 60, "de tresorerie"),
    ];
    const lignes = reconstruireLignes(items);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.items.map((i) => i.chaine).join(" ")).toBe("Remboursement avance de tresorerie");
  });

  it("ne fusionne pas deux lignes distinctes espacees de 9 unites", () => {
    const items = [item(10, 509, 20, "A"), item(10, 500, 20, "B")];
    const lignes = reconstruireLignes(items);
    expect(lignes).toHaveLength(2);
  });
});

describe("estPdfNatif - natif vs scan", () => {
  function page(nbItems: number): PageTexte {
    return { largeur: 842, hauteur: 595, lignes: [], nbItems };
  }
  it("reconnait un PDF natif (couche texte dense)", () => {
    expect(estPdfNatif([page(500), page(480), page(510)])).toBe(true);
  });
  it("detecte un scan (couche texte quasi vide) -> fallback OCR", () => {
    expect(estPdfNatif([page(0), page(1), page(0)])).toBe(false);
  });
  it("aucune page -> non natif", () => {
    expect(estPdfNatif([])).toBe(false);
  });
});
