// Tests du parseur d'appels de fonds sur des pages SYNTHETIQUES : items positionnes construits a
// la main, reproduisant le gabarit reel (colonnes alignees a droite, ligne de detail dessinee sur
// TROIS sous-lignes, faux gras) avec des noms et des montants INVENTES. Les PDF reels portent des
// noms de coproprietaires et ne peuvent pas entrer au depot ; le smoke les confronte a part.

import { describe, expect, it } from "vitest";

import { reconstruireLignes } from "@/lib/reprise/adapters/shared/pdf-texte";
import type { ItemTexte, PageTexte } from "@/lib/reprise/adapters/shared/pdf-texte";
import {
  detecterColonnesAppel,
  extraireCle,
  parserAppelsFonds,
} from "@/lib/reprise/adapters/shared/parseur-appels-fonds";
import {
  appelsEnEcart,
  appelsLotsIncomplets,
  controlerAppel,
  ecartSousTotaux,
  lignesSansCle,
  totalGeneral,
  totauxParCle,
  totauxParNature,
  totauxParNatureEtCle,
  totauxParPeriode,
} from "@/lib/reprise/domain/appel-fonds";

/** [x, largeur, chaine] : un item de texte positionne, ecrit court pour que les fixtures se lisent. */
type ItemBrut = [number, number, string];

/** Construit une page a partir de lignes visuelles decrites par leur y et leurs items. */
function construirePage(lignes: { y: number; items: ItemBrut[] }[]): PageTexte {
  const items: ItemTexte[] = [];
  for (const l of lignes) {
    for (const [x, largeur, chaine] of l.items) items.push({ x, y: l.y, largeur, chaine });
  }
  return { largeur: 595, hauteur: 842, lignes: reconstruireLignes(items), nbItems: items.length };
}

/** En-tete du tableau de detail, aux abscisses du gabarit reel (colonnes alignees a DROITE). */
const ENTETE_TABLEAU: { y: number; items: ItemBrut[] } = {
  y: 398,
  items: [
    [42, 12, "Lot"],
    [125, 63, "Nature de l'appel"],
    [323, 67, "Montant à répartir"],
    [420, 51, "Vos tantièmes"],
    [490, 61, "Votre quote part"],
  ],
};

/** Un bloc de detail : les TROIS sous-lignes empilees d'une ligne d'appel. */
function blocDetail(
  yHaut: number,
  lot: string,
  natureLot: string,
  nature: string,
  cle: string,
  aRepartir: string,
  tantiemes: string,
  quotePart: string,
): { y: number; items: ItemBrut[] }[] {
  // Les montants sont poses par leur bord DROIT, comme le fait le gabarit : x = droit - largeur.
  const droite = (droit: number, largeur: number, chaine: string): ItemBrut => [droit - largeur, largeur, chaine];
  return [
    { y: yHaut, items: [[42, 11, lot], [125, 114, nature]] },
    {
      y: yHaut - 5,
      items: [droite(391, 35, aRepartir), droite(471, 29, tantiemes), droite(552, 22, quotePart)],
    },
    { y: yHaut - 10, items: [[42, 16, natureLot], [125, 67, `(${cle})`]] },
  ];
}

/** Page 1 complete d'un appel : entete, chapo, tableau, totaux. Noms et montants inventes. */
function pageAppelComplete(): PageTexte {
  return construirePage([
    // Faux gras : le titre et plusieurs libelles sont DESSINES DEUX FOIS au meme endroit.
    { y: 805, items: [[501, 64, "Camille MARTIN"], [501.3, 64, "Camille MARTIN"]] },
    { y: 768, items: [[510, 56, "Le 08/01/2026"]] },
    { y: 677, items: [[250, 94, "Appel de fonds"], [250.3, 94, "Appel de fonds"]] },
    { y: 656, items: [[264, 67, "du 01 janvier 2026"], [264.3, 67, "du 01 janvier 2026"]] },
    { y: 612, items: [[28, 22, "Lots :"], [52, 147, "Cave (Lot 114) ; Appartement (Lot 101)"]] },
    {
      y: 553,
      items: [
        [28, 187, "Votre appel de fonds provisionnel d’un montant de"],
        [217, 32, "354,00 €"],
        [250, 275, "vient d’être émis sur la période du 01 janvier au 01 avril 2026. Il comprend :"],
      ],
    },
    { y: 536, items: [[51, 146, "Des provisions pour charges courantes :"], [199, 32, "333,00 €"]] },
    { y: 524, items: [[51, 128, "Des provisions pour fonds travaux :"], [181, 27, "21,00 €"]] },
    ENTETE_TABLEAU,
    ...blocDetail(381, "114", "Cave", "Provision pour charges courantes", "Charges générales", "1 000,00 €", "3 / 1000", "3,00 €"),
    ...blocDetail(352, "114", "Cave", "Provision pour charges courantes", "Tantièmes CHARGES BATIMENT - A", "2 000,00 €", "3 / 1000", "6,00 €"),
    ...blocDetail(323, "114", "Cave", "Provision pour fonds travaux", "Charges générales", "200,00 €", "3 / 1000", "0,60 €"),
    { y: 293, items: [[42, 39, "Total du lot"], [527, 25, "9,60 €"], [527.3, 25, "9,60 €"]] },
    ...blocDetail(275, "101", "Appartement", "Provision pour charges courantes", "Charges générales", "1 000,00 €", "102 / 1000", "102,00 €"),
    ...blocDetail(246, "101", "Appartement", "Provision pour charges courantes", "Tantièmes CHARGES BATIMENT - A", "2 000,00 €", "111 / 1000", "222,00 €"),
    ...blocDetail(217, "101", "Appartement", "Provision pour fonds travaux", "Charges générales", "200,00 €", "102 / 1000", "20,40 €"),
    { y: 187, items: [[42, 39, "Total du lot"], [521, 31, "344,40 €"]] },
    { y: 157, items: [[396, 70, "TOTAL À RÉGLER"], [516, 36, "354,00 €"], [516.3, 36, "354,00 €"]] },
  ]);
}

/** Page 2 : moyens de paiement + prochain appel. Aucune de ses lignes ne doit devenir un detail. */
function pageAnnexe(): PageTexte {
  return construirePage([
    { y: 805, items: [[28, 158, "Comment payer vos appels de fonds ?"], [28.3, 158, "Comment payer vos appels de fonds ?"]] },
    { y: 662, items: [[103, 29, "Libellé :"], [134, 111, "Paiement - MARTIN Camille"]] },
    { y: 542, items: [[28, 221, "Le prochain appel de fonds aura lieu le 01/04/2026 :"]] },
    { y: 516, items: [[42, 64, "Type de provision"], [521, 30, "Montant"]] },
    { y: 498, items: [[42, 114, "Provision pour charges courantes"], [521, 31, "498,00 €"]] },
    { y: 480, items: [[42, 97, "Provision pour fonds travaux"], [526, 25, "23,00 €"]] },
  ]);
}

describe("detecterColonnesAppel", () => {
  it("ancre les colonnes sur les en-tetes imprimes", () => {
    const col = detecterColonnesAppel(pageAppelComplete());
    expect(col).not.toBeNull();
    expect(col!.tantiemes.droit).toBeCloseTo(471, 1);
    expect(col!.quotePart.droit).toBeCloseTo(551, 1);
    expect(col!.aRepartir?.droit).toBeCloseTo(390, 1);
    // Frontiere texte / montants : le bord gauche de la premiere colonne numerique.
    expect(col!.texteMaxX).toBeCloseTo(323, 1);
    expect(col!.natureMinX).toBeCloseTo(125, 1);
  });

  it("ne prend pas le libelle de cle '(Tantiemes ...)' pour un en-tete de colonne", () => {
    // Une page qui ne porte QUE des lignes de detail : sans garde-fou, "(Tantiemes CHARGES
    // BATIMENT - A)" fournirait l'ancre des tantiemes en pleine colonne des libelles.
    const page = construirePage(
      blocDetail(381, "114", "Cave", "Provision pour charges courantes", "Tantièmes CHARGES BATIMENT - A", "2 000,00 €", "3 / 1000", "6,00 €"),
    );
    expect(detecterColonnesAppel(page)).toBeNull();
  });

  it("rend null sur une page sans tableau de detail", () => {
    expect(detecterColonnesAppel(pageAnnexe())).toBeNull();
  });
});

describe("extraireCle", () => {
  it("prend le contenu des dernieres parentheses", () => {
    expect(extraireCle("Provision pour charges courantes (Charges générales)")).toBe("Charges générales");
    expect(extraireCle("Provision (bis) pour charges (Tantièmes CHARGES BATIMENT - A)")).toBe(
      "Tantièmes CHARGES BATIMENT - A",
    );
  });

  it("rend undefined quand le libelle n'en porte pas", () => {
    expect(extraireCle("Provision pour charges courantes")).toBeUndefined();
    expect(extraireCle("Provision ()")).toBeUndefined();
    expect(extraireCle("")).toBeUndefined();
  });
});

describe("parserAppelsFonds - cas nominal", () => {
  const resultat = parserAppelsFonds([pageAppelComplete(), pageAnnexe()], "doc-001");
  const appel = resultat.appels[0]!;

  it("reconstruit un seul appel, sans aucune note de diagnostic", () => {
    expect(resultat.appels).toHaveLength(1);
    expect(resultat.notes).toEqual([]);
  });

  it("lit la periode sous le titre, pas la date d'emission imprimee plus haut", () => {
    expect(appel.periode).toBe("01/01/2026");
    expect(appel.dateEmission).toBe("08/01/2026");
  });

  it("reconstitue les six lignes de detail a partir des sous-lignes empilees", () => {
    expect(appel.lignes).toHaveLength(6);
    expect(appel.lignes[0]).toEqual({
      lot: "114",
      natureLot: "Cave",
      libelle: "Provision pour charges courantes (Charges générales)",
      nature: "Provision pour charges courantes",
      cle: "Charges générales",
      montantARepartir: 1000,
      tantiemes: "3 / 1000",
      montant: 3,
    });
    expect(appel.lignes[4]!.cle).toBe("Tantièmes CHARGES BATIMENT - A");
    expect(appel.lignes[4]!.lot).toBe("101");
    expect(appel.lignes[4]!.montant).toBe(222);
  });

  it("ne confond jamais le numero de lot avec la nature du lot", () => {
    expect(appel.lignes.map((l) => l.lot)).toEqual(["114", "114", "114", "101", "101", "101"]);
    expect(appel.lignes.map((l) => l.natureLot)).toEqual([
      "Cave", "Cave", "Cave", "Appartement", "Appartement", "Appartement",
    ]);
  });

  it("prend le montant de l'appel dans le chapo et non le TOTAL A REGLER du pied", () => {
    expect(appel.totalImprime).toBe(354);
    expect(appel.totalARegler).toBe(354);
    expect(appel.sousTotauxImprimes).toEqual([
      { libelle: "charges courantes", montant: 333 },
      { libelle: "fonds travaux", montant: 21 },
    ]);
    expect(ecartSousTotaux(appel)).toBe(0);
  });

  it("capture les lots annonces, les totaux par lot et la reference de paiement", () => {
    expect(appel.lotsAnnonces).toEqual(["114", "101"]);
    expect(appel.totauxLotImprimes).toEqual({ "114": 9.6, "101": 344.4 });
    expect(appel.reference).toBe("MARTIN Camille");
    expect(appel.source).toBe("doc-001");
  });

  it("retombe sur les totaux imprimes, au document et lot par lot", () => {
    const controle = controlerAppel(appel);
    expect(controle.total).toBe(354);
    expect(controle.ecart).toBe(0);
    expect(controle.ecartsLot).toEqual([]);
    expect(controle.lots).toEqual(["101", "114"]);
    expect(appelsEnEcart([appel])).toEqual([]);
    expect(appelsLotsIncomplets([appel])).toEqual([]);
  });

  it("n'avale pas le tableau du PROCHAIN appel imprime en page 2", () => {
    // Ses lignes ("Provision pour charges courantes 498,00 €") n'ont pas de tantiemes : sans ce
    // critere, le prochain trimestre serait compte comme s'il etait deja appele.
    expect(totalGeneral(resultat.appels)).toBe(354);
  });
});

describe("parserAppelsFonds - pieges de gabarit", () => {
  it("ne compte pas deux fois un montant dessine en double (faux gras)", () => {
    const bloc = blocDetail(381, "114", "Cave", "Provision pour charges courantes", "Charges générales", "1 000,00 €", "3 / 1000", "3,00 €");
    // On redessine la sous-ligne du milieu par-dessus elle-meme, decalee de 0,3 unite.
    const milieu = bloc[1]!;
    milieu.items = [...milieu.items, ...milieu.items.map(([x, l, c]): ItemBrut => [x + 0.3, l, c])];
    const page = construirePage([
      { y: 677, items: [[250, 94, "Appel de fonds"]] },
      { y: 656, items: [[264, 67, "du 01 avril 2026"]] },
      ENTETE_TABLEAU,
      ...bloc,
    ]);
    const r = parserAppelsFonds([page]);
    expect(r.appels[0]!.lignes).toHaveLength(1);
    expect(r.appels[0]!.lignes[0]!.montant).toBe(3);
    expect(r.appels[0]!.lignes[0]!.montantARepartir).toBe(1000);
  });

  it("classe correctement des colonnes CENTREES et non alignees a droite", () => {
    // Meme tableau, valeurs centrees sous leur en-tete : l'ancrage prend la plus petite des deux
    // distances (bord droit / centre), le parseur tient donc les deux conventions.
    const centre = (c: number, largeur: number, chaine: string): ItemBrut => [c - largeur / 2, largeur, chaine];
    const page = construirePage([
      { y: 677, items: [[250, 94, "Appel de fonds"]] },
      { y: 656, items: [[264, 67, "du 01 avril 2026"]] },
      ENTETE_TABLEAU,
      { y: 381, items: [[42, 11, "114"], [125, 114, "Provision pour charges courantes"]] },
      {
        y: 376,
        items: [centre(356, 35, "1 000,00 €"), centre(445, 29, "3 / 1000"), centre(520, 22, "3,00 €")],
      },
      { y: 371, items: [[42, 16, "Cave"], [125, 67, "(Charges générales)"]] },
    ]);
    const ligne = parserAppelsFonds([page]).appels[0]!.lignes[0]!;
    expect(ligne.montantARepartir).toBe(1000);
    expect(ligne.montant).toBe(3);
    expect(ligne.tantiemes).toBe("3 / 1000");
  });

  it("ne prend pas 'Comment payer vos appels de fonds ?' pour un second titre", () => {
    const r = parserAppelsFonds([pageAppelComplete(), pageAnnexe()]);
    expect(r.appels).toHaveLength(1);
  });

  it("enchaine plusieurs appels dans un meme flux de pages", () => {
    const r = parserAppelsFonds([pageAppelComplete(), pageAnnexe(), pageAppelComplete()]);
    expect(r.appels).toHaveLength(2);
    expect(r.appels.every((a) => a.lignes.length === 6)).toBe(true);
    // La reference lue en page 2 appartient au PREMIER appel, pas au suivant.
    expect(r.appels[0]!.reference).toBe("MARTIN Camille");
    expect(r.appels[1]!.reference).toBeUndefined();
  });
});

describe("parserAppelsFonds - echec VISIBLE", () => {
  it("signale un flux sans aucun titre d'appel au lieu de rendre un resultat vide muet", () => {
    const r = parserAppelsFonds([pageAnnexe()]);
    expect(r.appels).toEqual([]);
    expect(r.notes.map((n) => n.motif)).toContain(
      "aucun appel de fonds reconnu sur 1 page(s) : titre imprime introuvable",
    );
  });

  it("signale un document dont aucune page ne porte les en-tetes du tableau", () => {
    const page = construirePage([
      { y: 677, items: [[250, 94, "Appel de fonds"]] },
      { y: 656, items: [[264, 67, "du 01 janvier 2026"]] },
    ]);
    const r = parserAppelsFonds([page]);
    expect(r.appels[0]!.lignes).toEqual([]);
    const motifs = r.notes.map((n) => n.motif);
    expect(motifs).toContain(
      "aucune page ne porte les en-tetes du tableau de detail (Vos tantiemes / Votre quote part)",
    );
    expect(motifs).toContain("appel de la periode 01/01/2026 sans aucune ligne de detail");
  });

  it("signale une periode introuvable sous le titre", () => {
    const page = construirePage([
      { y: 677, items: [[250, 94, "Appel de fonds"]] },
      { y: 656, items: [[264, 67, "Madame, Monsieur,"]] },
    ]);
    const r = parserAppelsFonds([page]);
    expect(r.appels[0]!.periode).toBe("");
    expect(r.notes.map((n) => n.motif)).toContain("periode de l'appel introuvable sous le titre");
    expect(r.notes.find((n) => n.motif.startsWith("periode"))?.page).toBe(1);
  });

  it("signale une ligne de detail sans cle de repartition entre parentheses", () => {
    const page = construirePage([
      { y: 677, items: [[250, 94, "Appel de fonds"]] },
      { y: 656, items: [[264, 67, "du 01 janvier 2026"]] },
      ENTETE_TABLEAU,
      { y: 381, items: [[42, 11, "114"], [125, 114, "Provision pour charges courantes"]] },
      { y: 376, items: [[356, 35, "1 000,00 €"], [442, 29, "3 / 1000"], [530, 22, "3,00 €"]] },
      { y: 371, items: [[42, 16, "Cave"]] },
    ]);
    const r = parserAppelsFonds([page]);
    expect(r.appels[0]!.lignes[0]!.cle).toBeUndefined();
    expect(lignesSansCle(r.appels)).toBe(1);
    expect(r.notes.map((n) => n.motif)).toContain(
      "ligne de detail sans cle de repartition entre parentheses",
    );
  });

  it("signale une ligne de detail sans numero de lot lisible", () => {
    const page = construirePage([
      { y: 677, items: [[250, 94, "Appel de fonds"]] },
      { y: 656, items: [[264, 67, "du 01 janvier 2026"]] },
      ENTETE_TABLEAU,
      { y: 381, items: [[125, 114, "Provision pour charges courantes"]] },
      { y: 376, items: [[356, 35, "1 000,00 €"], [442, 29, "3 / 1000"], [530, 22, "3,00 €"]] },
      { y: 371, items: [[125, 67, "(Charges générales)"]] },
    ]);
    const r = parserAppelsFonds([page]);
    expect(r.appels[0]!.lignes[0]!.lot).toBe("");
    expect(r.notes.map((n) => n.motif)).toContain("ligne de detail sans numero de lot lisible");
  });
});

describe("controles du domaine", () => {
  const appels = parserAppelsFonds([pageAppelComplete(), pageAnnexe()], "doc-001").appels;

  it("ventile par cle, par nature et par couple nature + cle", () => {
    expect(totauxParCle(appels)).toEqual([
      { libelle: "Tantièmes CHARGES BATIMENT - A", montant: 228, nbLignes: 2 },
      { libelle: "Charges générales", montant: 126, nbLignes: 4 },
    ]);
    expect(totauxParNature(appels)).toEqual([
      { libelle: "Provision pour charges courantes", montant: 333, nbLignes: 4 },
      { libelle: "Provision pour fonds travaux", montant: 21, nbLignes: 2 },
    ]);
    // La cle "Charges generales" porte DEUX natures : les additionner ferait un total juste et un
    // import faux (charges courantes et fonds travaux ne vont pas sur le meme compte de produit).
    expect(totauxParNatureEtCle(appels)).toEqual([
      { libelle: "Provision pour charges courantes | Tantièmes CHARGES BATIMENT - A", montant: 228, nbLignes: 2 },
      { libelle: "Provision pour charges courantes | Charges générales", montant: 105, nbLignes: 2 },
      { libelle: "Provision pour fonds travaux | Charges générales", montant: 21, nbLignes: 2 },
    ]);
    expect(totauxParPeriode(appels)).toEqual([
      { libelle: "01/01/2026", montant: 354, nbLignes: 6 },
    ]);
  });

  it("voit une ligne perdue sur un lot alors que le total du document se compense", () => {
    // On retire 3,00 EUR au lot 114 et on les ajoute au lot 101 : le total du document reste juste,
    // seul le controle lot par lot revele l'erreur.
    const truque = structuredClone(appels[0]!);
    truque.lignes[0]!.montant = 0;
    truque.lignes[3]!.montant = 105;
    expect(controlerAppel(truque).ecart).toBe(0);
    expect(controlerAppel(truque).ecartsLot).toEqual([
      { lot: "101", total: 347.4, imprime: 344.4, ecart: 3 },
      { lot: "114", total: 6.6, imprime: 9.6, ecart: -3 },
    ]);
    expect(appelsEnEcart([truque])).toHaveLength(1);
  });

  it("voit un lot annonce en tete mais absent du tableau", () => {
    const truque = structuredClone(appels[0]!);
    truque.lignes = truque.lignes.filter((l) => l.lot !== "101");
    const manquants = appelsLotsIncomplets([truque]);
    expect(manquants).toHaveLength(1);
    expect(manquants[0]!.lots).toEqual(["114"]);
  });

  it("voit des sous-totaux de tete qui ne font pas le montant de l'appel", () => {
    const truque = structuredClone(appels[0]!);
    truque.sousTotauxImprimes = [{ libelle: "charges courantes", montant: 333 }];
    expect(ecartSousTotaux(truque)).toBe(-21);
  });
});
