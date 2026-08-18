// Tests du parseur RGD : items 100 % SYNTHETIQUES (noms inventes) reproduisant la mise en
// page reelle du RGD Matera S0303 - sections par cle, en-tetes de compte "NNN - Libelle" en
// faux gras, cellule TVA parfois ABSENTE (ancrage par x obligatoire), avoir negatif, totaux
// imprimes a trois niveaux, pied de page dont les nombres tombent dans la zone des montants.
import { describe, expect, it } from "vitest";
import { parserRgd, detecterColonnesRgd } from "../parseur-rgd";
import { verifierTotauxRgd } from "@/lib/reprise/domain/rgd";
import { reconstruireLignes, type ItemTexte, type PageTexte } from "../pdf-texte";

function t(x: number, y: number, largeur: number, chaine: string): ItemTexte {
  return { x, y, largeur, chaine };
}
function page(items: ItemTexte[]): PageTexte {
  const lignes = reconstruireLignes(items);
  return { largeur: 595, hauteur: 842, lignes, nbItems: items.length };
}
/** Item dessine deux fois au meme endroit (faux gras des titres Matera). */
function double(x: number, y: number, largeur: number, chaine: string): ItemTexte[] {
  return [t(x, y, largeur, chaine), t(x, y, largeur, chaine)];
}
// Colonnes mesurees sur le vrai document : Montant ~350, TVA ~415, Recuperable ~470, Deductible ~530.
function enteteColonnes(y: number): ItemTexte[] {
  return [
    t(32, y, 16, "Date"),
    t(113, y, 24, "Libellé"),
    t(341, y, 45, "Montant total"),
    t(404, y, 40, "TVA incluse"),
    t(461, y, 42, "Récupérable"),
    t(526, y, 38, "Déductible"),
  ];
}

function pageRgd(): PageTexte {
  return page([
    ...enteteColonnes(730),
    // SECTION (cle de repartition), en faux gras.
    ...double(33, 704, 70, "Charges générales"),
    // COMPTE avec cellule TVA ABSENTE sur sa ligne de depense.
    ...double(33, 674, 160, "602001 - Electricité - Charges générales"),
    t(33, 651, 48, "30 janvier 2026"),
    t(114, 651, 30, "FOURNELEC -"),
    t(357, 651, 28, "200,16 €"),
    t(474, 651, 26, "200,16 €"), // recuperable - PAS de TVA sur cette ligne
    t(542, 651, 22, "0,00 €"),
    t(33, 632, 140, "Total 602001 - Electricité - Charges générales"),
    t(357, 632, 28, "200,16 €"),
    t(474, 632, 26, "200,16 €"),
    t(542, 632, 22, "0,00 €"),
    // COMPTE avec TVA + avoir NEGATIF.
    ...double(33, 605, 100, "626 - Frais postaux"),
    t(33, 582, 46, "31 janvier 2026"),
    t(114, 582, 60, "Courrier SENDTEST"),
    t(365, 582, 20, "2,49 €"),
    t(424, 582, 20, "0,50 €"),
    t(483, 582, 20, "0,00 €"),
    t(542, 582, 20, "2,49 €"),
    t(33, 563, 44, "04 mars 2026"),
    t(114, 563, 50, "Mise en demeure"),
    t(363, 563, 24, "-2,75 €"),
    t(483, 563, 20, "0,00 €"),
    t(539, 563, 24, "-2,75 €"),
    t(33, 540, 60, "Total 626 - Frais postaux"),
    t(363, 540, 24, "-0,26 €"),
    t(424, 540, 20, "0,50 €"),
    t(483, 540, 20, "0,00 €"),
    t(539, 540, 24, "-0,26 €"),
    // Total de SECTION puis TOTAL GENERAL.
    t(33, 510, 80, "Total Charges générales"),
    t(357, 510, 30, "199,90 €"),
    t(424, 510, 20, "0,50 €"),
    t(474, 510, 26, "200,16 €"),
    t(539, 510, 24, "-0,26 €"),
    t(33, 480, 50, "Total général"),
    t(357, 480, 30, "199,90 €"),
    t(424, 480, 20, "0,50 €"),
    t(474, 480, 26, "200,16 €"),
    t(539, 480, 24, "-0,26 €"),
    // Pied de page : ses nombres tombent DANS la zone des montants.
    t(510, 29, 18, "Page"),
    t(532, 29, 6, "1"),
    t(540, 29, 12, "sur"),
    t(555, 29, 6, "1"),
  ]);
}

describe("detecterColonnesRgd", () => {
  it("ancre les 4 colonnes par leurs en-tetes imprimes", () => {
    const col = detecterColonnesRgd(page(enteteColonnes(700)));
    expect(col).not.toBeNull();
    expect(col!.montantX).toBeCloseTo(363.5, 0);
    expect(col!.tvaX).not.toBeNull();
    expect(col!.recuperableX).not.toBeNull();
    expect(col!.deductibleX).not.toBeNull();
  });

  it("null sans en-tete reconnu (document qui n'est pas un RGD)", () => {
    expect(detecterColonnesRgd(page([t(10, 700, 40, "Bonjour"), t(100, 700, 40, "Monde")]))).toBeNull();
  });
});

describe("parserRgd - mise en page Matera", () => {
  it("depenses rattachees a leur compte ET a leur cle, TVA absente geree par l'ancrage x", () => {
    const r = parserRgd([pageRgd()]);
    expect(r.depenses).toHaveLength(3);

    const elec = r.depenses[0]!;
    expect(elec).toMatchObject({
      compte: "602001",
      cle: "Charges générales",
      date: "30/01/2026",
      montant: 200.16,
      recuperable: 200.16,
      deductible: 0,
    });
    expect(elec.tva).toBeUndefined(); // cellule absente -> champ absent, PAS 0 par defaut
    expect(elec.intituleCompte).toBe("Electricité - Charges générales");

    // L'avoir garde son signe.
    expect(r.depenses[2]).toMatchObject({ compte: "626", montant: -2.75 });
  });

  it("capture les totaux aux trois niveaux et la reconciliation tombe a zero ecart", () => {
    const r = parserRgd([pageRgd()]);
    const portees = r.totaux.map((x) => x.portee);
    expect(portees).toContain("compte:602001");
    expect(portees).toContain("compte:626");
    expect(portees).toContain("section:Charges générales");
    expect(portees).toContain("general");
    expect(r.totaux.find((x) => x.portee === "general")!.montant).toBeCloseTo(199.9, 2);

    const verdict = verifierTotauxRgd(r.depenses, r.totaux);
    expect(verdict.controles).toBe(4);
    expect(verdict.enEcart).toHaveLength(0);
  });

  it("le pied de page ne fabrique NI depense NI montant parasite", () => {
    const r = parserRgd([pageRgd()]);
    // 199,90 = 200,16 + 2,49 - 2,75 : les "1" du pied de page n'y sont pas.
    const somme = r.depenses.reduce((s, d) => s + d.montant, 0);
    expect(somme).toBeCloseTo(199.9, 2);
  });

  it("document illisible -> zero depense + note explicite, jamais un vide silencieux", () => {
    const r = parserRgd([page([t(10, 700, 40, "Bonjour")])]);
    expect(r.depenses).toHaveLength(0);
    expect(r.notes.some((n) => /AUCUNE depense/i.test(n))).toBe(true);
  });

  it("verifierTotauxRgd LOCALISE un ecart (depense perdue)", () => {
    const r = parserRgd([pageRgd()]);
    const ampute = r.depenses.filter((d) => d.date !== "04/03/2026"); // on "perd" l'avoir
    const verdict = verifierTotauxRgd(ampute, r.totaux);
    expect(verdict.enEcart.length).toBeGreaterThan(0);
    expect(verdict.enEcart.some((e) => e.portee === "compte:626" && e.champ === "montant")).toBe(true);
  });
});
