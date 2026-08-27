// Tests du parseur COLONNES A DROITE : items 100 % SYNTHETIQUES (aucun nom ni montant reel)
// reproduisant la geometrie du 3e format de grand livre (S0304, ancien syndic du sortant) :
// colonnes calees a droite (identite = x1 du dernier token), 3 colonnes de solde progressif
// a ECARTER, en-tete de compte pointe, deux dates par ligne, "Solde anterieur" en report,
// "Total Compte" en filet. Chaque piege documente au skill a ici un test qui le ferait
// echouer : recollage des milliers, millesime imitant un compte, journal d'anomalies a zero.
import { describe, expect, it } from "vitest";
import {
  detecterColonnesDroite,
  detecterFormatColonnesDroite,
  grouperMontantsDroite,
  parserGrandLivreColonnesDroite,
} from "../parseur-grand-livre-colonnes-droite";
import { reconstruireLignes, type ItemTexte, type PageTexte } from "../pdf-texte";
import { normaliserGrandLivre } from "../normaliser-compta";
import { verifierEquilibreGrandLivre } from "@/lib/reprise/domain/ecriture";
import { verifierTotauxParCompte } from "@/lib/reprise/domain/controle-comptes";

function t(x: number, y: number, largeur: number, chaine: string): ItemTexte {
  return { x, y, largeur, chaine };
}

function page(items: ItemTexte[]): PageTexte {
  return { largeur: 842, hauteur: 595, lignes: reconstruireLignes(items), nbItems: items.length };
}

// Geometrie mesuree sur le format reel : les COLONNES DE DONNEES finissent a x1 = 587 (debit),
// 646 (credit), 705 / 764 / 823 (soldes progressifs) tandis que les EN-TETES imprimes finissent
// un peu a gauche (571 / 632 / 720 / 821) - c'est ce decalage que le mapping "ancre la plus
// proche en x1" doit absorber.
function enTetes(y: number): ItemTexte[] {
  return [
    t(39, y, 12, "C.J"),
    t(65, y, 53, "Date de valeur"),
    t(140, y, 16, "Date"),
    t(180, y, 64, "Référence facture"),
    t(262, y, 28, "Écriture"),
    t(321, y, 28, "Compte"),
    t(439, y, 24, "Libellé"),
    t(553, y, 18, "Débit"),
    t(610, y, 22, "Crédit"),
    t(699, y, 21, "Solde"),
    t(775, y, 46, 'Solde "AGE"'),
  ];
}

/** Montant cale a droite sur le x1 de sa colonne (identite de colonne du format). */
function montant(x1: number, y: number, chaine: string): ItemTexte {
  const largeur = chaine.length * 3.8;
  return t(x1 - largeur, y, largeur, chaine);
}

const X1_DEBIT = 587;
const X1_CREDIT = 646;
const X1_SOLDE_D = 705;
const X1_SOLDE_C = 764;
const X1_AGE = 823;

describe("detecterColonnesDroite / detecterFormatColonnesDroite", () => {
  it("cale les ancres sur les en-tetes imprimes et ecarte les trois soldes", () => {
    const col = detecterColonnesDroite(page(enTetes(500)));
    expect(col).not.toBeNull();
    expect(col!.debitX1).toBeCloseTo(571, 0);
    expect(col!.creditX1).toBeCloseTo(632, 0);
    expect(col!.exclusionsX1.length).toBe(2); // "Solde" + 'Solde "AGE"'
    expect(col!.montantMinX).toBeCloseTo(531, 0);
  });

  it("reconnait le format sur ses en-tetes, et PAS le format Matera", () => {
    expect(detecterFormatColonnesDroite([page(enTetes(500))])).toBe(true);
    // En-tetes du format deja gere par le parseur positions : pas de C.J / Date de valeur.
    const matera = page([
      t(40, 500, 20, "Date"),
      t(120, 500, 60, "Contrepartie"),
      t(300, 500, 30, "Libellé"),
      t(640, 500, 20, "Débit"),
      t(690, 500, 20, "Crédit"),
    ]);
    expect(detecterFormatColonnesDroite([matera])).toBe(false);
  });
});

describe("grouperMontantsDroite - recollage du separateur de milliers", () => {
  it("recolle '11' + '917,04' en un seul montant porte par le x1 du dernier token", () => {
    // Piege documente : le groupe de milliers est parfois un token separe. Montant dont les
    // milliers commencent par DEUX CHIFFRES IDENTIQUES (test de non-regression du skill).
    const g = grouperMontantsDroite([t(610, 100, 8, "11"), t(622, 100, 24, "917,04")]);
    expect(g).toEqual([{ x1: 646, valeur: 11917.04 }]);
  });

  it("ne fusionne pas deux montants voisins de colonnes differentes", () => {
    const g = grouperMontantsDroite([montant(X1_DEBIT, 100, "179,93"), montant(X1_SOLDE_D, 100, "179,93")]);
    expect(g.map((m) => m.valeur)).toEqual([179.93, 179.93]);
    expect(g[0]!.x1).toBeCloseTo(X1_DEBIT, 0);
    expect(g[1]!.x1).toBeCloseTo(X1_SOLDE_D, 0);
  });

  it("ignore un fragment orphelin (numero d'ecriture '706') sans decimales", () => {
    expect(grouperMontantsDroite([t(256, 100, 12, "706")])).toEqual([]);
  });
});

/** Page synthetique complete : un compte, un report, trois ecritures, totaux et syntheses. */
function pageComplete(): PageTexte {
  let y = 560;
  const suiv = (pas = 12) => (y -= pas);
  const items: ItemTexte[] = [
    // Decor de page (le titre traverse la zone montants sans etre un nombre).
    t(661, 585, 163, "Grand livre (Date de valeur) du 01/07/2024 au 30/06/2025 - page 1/2"),
    t(49, 573, 300, "RESIDENCE LES OLIVIERS TEST - 1 RUE FICTIVE"),
    ...enTetes(y),
  ];
  // En-tete de compte + intitule (donnees inventees).
  suiv();
  items.push(t(305, y, 53, "1031.000000000"), t(374, y, 92, "AVANCES DE TESTS"));
  // Report d'ouverture au credit (avec ses echos dans les colonnes de solde, a ecarter).
  suiv();
  items.push(
    t(374, y, 47, "Solde antérieur"),
    montant(X1_CREDIT, y, "11 917,04"),
    montant(X1_SOLDE_C, y, "11 917,04"),
    montant(X1_AGE, y, "11 917,04"),
  );
  // Ecriture 1 : debit, deux dates (valeur puis saisie) - la date de VALEUR fait foi.
  suiv();
  items.push(
    t(35, y, 20, "VECC"),
    t(74, y, 35, "02/08/2024"),
    t(130, y, 36, "27/02/2025"),
    t(256, y, 12, "706"),
    t(374, y, 117, "Remboursement avance de test"),
    montant(X1_DEBIT, y, "179,93"),
    montant(X1_SOLDE_D, y, "179,93"),
    montant(X1_AGE, y, "11 737,11"),
  );
  // Ecriture 2 : credit, milliers en token SEPARE ("1" + "811,63") a recoller.
  suiv();
  items.push(
    t(35, y, 20, "AFCC"),
    t(74, y, 35, "03/09/2024"),
    t(130, y, 36, "27/02/2025"),
    t(256, y, 12, "988"),
    t(374, y, 84, "Appel avance de test"),
    t(624, y, 4, "1"),
    t(630, y, 16, "811,63"),
    montant(X1_SOLDE_C, y, "1 811,63"),
    montant(X1_AGE, y, "13 728,67"),
  );
  // Repli de libelle sans montant (ligne de continuation) : ignore sans bruit.
  suiv();
  items.push(t(374, y, 120, "RENOVATION DE LA CHAUDIERE TEST 2/3"));
  // Sous-total periodique : ignore.
  suiv();
  items.push(
    t(374, y, 61, "Total Mois 2024/09"),
    montant(X1_DEBIT, y, "179,93"),
    montant(X1_CREDIT, y, "1 811,63"),
    montant(X1_SOLDE_D, y, "179,93"),
    montant(X1_SOLDE_C, y, "13 728,67"),
  );
  // Ecriture 3 : debit.
  suiv();
  items.push(
    t(35, y, 20, "BQEN"),
    t(74, y, 35, "21/10/2024"),
    t(130, y, 36, "21/10/2024"),
    t(256, y, 16, "1529"),
    t(374, y, 86, "Prélèvement du 21/10/2024"),
    montant(X1_DEBIT, y, "35,58"),
    montant(X1_SOLDE_D, y, "35,58"),
    montant(X1_AGE, y, "13 693,09"),
  );
  // Total du compte : report credit 11 917,04 + ecritures (d 215,51 / c 1 811,63).
  suiv();
  items.push(
    t(374, y, 99, "Total Compte 1031.000000000"),
    montant(X1_DEBIT, y, "215,51"),
    montant(X1_CREDIT, y, "13 728,67"),
    montant(X1_SOLDE_C, y, "13 513,16"),
  );
  // Sous-total de classe et total general du format : ignores.
  suiv();
  items.push(t(469, y, 59, "Sous total class 10"), montant(X1_DEBIT, y, "215,51"), montant(X1_CREDIT, y, "13 728,67"));
  suiv();
  items.push(t(374, y, 47, "Total Immeuble"), montant(X1_DEBIT, y, "215,51"), montant(X1_CREDIT, y, "13 728,67"));
  // Pied de page publicitaire traversant la zone montants (jamais une anomalie).
  items.push(t(622, 20, 167, "Le 27/02/2025 - SYNDIC: FICTIF TEST - 9 rue Inventee"));
  return page(items);
}

describe("parserGrandLivreColonnesDroite - page complete", () => {
  const res = parserGrandLivreColonnesDroite([pageComplete()]);

  it("transcrit les ecritures avec la date de VALEUR et ecarte les soldes progressifs", () => {
    expect(res.lignes).toHaveLength(3);
    expect(res.lignes[0]).toMatchObject({
      compte: "1031.000000000",
      date: "02/08/2024", // la date de valeur, jamais la date de saisie 27/02/2025
      sens: "debit",
      montant: 179.93,
    });
    expect(res.lignes[1]).toMatchObject({ sens: "credit", montant: 1811.63, date: "03/09/2024" });
    expect(res.lignes[2]).toMatchObject({ sens: "debit", montant: 35.58 });
  });

  it("capture le report 'Solde anterieur' et le total imprime, et reconcilie a 0", () => {
    expect(res.controles).toHaveLength(1);
    expect(res.controles[0]).toMatchObject({
      compte: "1031.000000000",
      reportCredit: 11917.04,
      totalDebit: 215.51,
      totalCredit: 13728.67,
    });
    // Chaine complete : normalisation puis controle par compte -> 0 ecart.
    const jeu = normaliserGrandLivre({ lignes: res.lignes, notes: [] });
    const controle = verifierTotauxParCompte(jeu.lignes, res.controles);
    expect(controle.nbComptesControles).toBe(1);
    expect(controle.nbEnEcart).toBe(0);
  });

  it("capture l'intitule du compte pour l'appariement par nom", () => {
    expect(res.intitules).toMatchObject({ "1031.000000000": "AVANCES DE TESTS" });
  });

  it("journal d'anomalies a ZERO : syntheses et decor de page ne sont pas des anomalies", () => {
    expect(res.anomalies).toEqual([]);
  });

  it("clot le compte apres 'Total Compte' (les lignes suivantes ne lui echoient plus)", () => {
    // Les ecritures s'arretent avant les sous-totaux : aucune ligne apres le total.
    expect(res.lignes.every((l) => l.compte === "1031.000000000")).toBe(true);
  });
});

describe("parserGrandLivreColonnesDroite - pieges", () => {
  it("accumule DEUX ouvertures d'un meme compte (sortant ayant lui-meme repris en cours)", () => {
    const items: ItemTexte[] = [
      ...enTetes(560),
      t(305, 548, 53, "4010.000000001"),
      t(374, 548, 60, "FOURNISSEUR TEST"),
      t(374, 536, 47, "Solde antérieur"),
      montant(X1_CREDIT, 536, "100,00"),
      t(374, 524, 47, "Solde antérieur au 25/02/2025"),
      montant(X1_CREDIT, 524, "50,00"),
    ];
    const res = parserGrandLivreColonnesDroite([page(items)]);
    expect(res.controles[0]).toMatchObject({ reportCredit: 150 });
  });

  it("refuse un millesime replie en libelle comme en-tete de compte (garde S0304)", () => {
    const items: ItemTexte[] = [
      ...enTetes(560),
      t(305, 548, 53, "4501.000000002"),
      t(374, 548, 40, "COPRO TEST"),
      // Libelle SEPA replie qui imite un en-tete "code - libelle" : PAS un compte.
      t(305, 536, 100, "2026 - Creditor Name SEPA : RESIDENCE TEST"),
      t(35, 524, 20, "VECC"),
      t(74, 524, 35, "05/01/2025"),
      t(130, 524, 36, "05/01/2025"),
      t(374, 524, 40, "Appel test"),
      montant(X1_DEBIT, 524, "12,00"),
    ];
    const res = parserGrandLivreColonnesDroite([page(items)]);
    expect(res.lignes).toHaveLength(1);
    // L'ecriture reste sur le compte courant, pas sur un compte fantome "2026".
    expect(res.lignes[0]!.compte).toBe("4501.000000002");
  });

  it("consigne au journal d'anomalies toute ligne a montant non reconnue", () => {
    const items: ItemTexte[] = [
      ...enTetes(560),
      t(305, 548, 53, "6140.000000000"),
      t(374, 548, 40, "ENTRETIEN TEST"),
      // Un montant en zone Debit porte par une ligne sans code journal ni mot-cle connu.
      t(374, 536, 60, "Régularisation inconnue"),
      montant(X1_DEBIT, 536, "99,99"),
      // Un mouvement APRES la cloture du compte (Total Compte) : perte d'information.
      t(374, 524, 99, "Total Compte 6140.000000000"),
      montant(X1_DEBIT, 524, "99,99"),
      t(35, 512, 20, "VECC"),
      t(74, 512, 35, "05/01/2025"),
      t(374, 512, 40, "Appel test"),
      montant(X1_DEBIT, 512, "10,00"),
    ];
    const res = parserGrandLivreColonnesDroite([page(items)]);
    expect(res.anomalies).toHaveLength(2);
    expect(res.anomalies[0]!.texte).toContain("Régularisation");
    expect(res.anomalies[1]!.compte).toBe(""); // apres le total, plus de compte courant
  });

  it("reutilise la calibration de la page precedente quand une page n'a pas d'en-tetes", () => {
    const p1: ItemTexte[] = [
      ...enTetes(560),
      t(305, 548, 53, "5120.000000000"),
      t(374, 548, 40, "BANQUE TEST"),
    ];
    const p2: ItemTexte[] = [
      t(35, 548, 20, "BQEN"),
      t(74, 548, 35, "10/02/2025"),
      t(130, 548, 36, "10/02/2025"),
      t(374, 548, 40, "Virement test"),
      montant(X1_CREDIT, 548, "42,42"),
    ];
    const res = parserGrandLivreColonnesDroite([page(p1), page(p2)]);
    expect(res.lignes).toHaveLength(1);
    expect(res.lignes[0]).toMatchObject({ compte: "5120.000000000", sens: "credit", montant: 42.42 });
  });

  it("equilibre global : un jeu symetrique debit/credit tombe a 0 apres normalisation", () => {
    const items: ItemTexte[] = [
      ...enTetes(560),
      t(305, 548, 53, "4500.000000003"),
      t(374, 548, 40, "COPRO A TEST"),
      t(35, 536, 20, "AFCC"),
      t(74, 536, 35, "01/07/2024"),
      t(374, 536, 40, "Appel test"),
      montant(X1_DEBIT, 536, "1 000,00"),
      t(374, 524, 99, "Total Compte 4500.000000003"),
      montant(X1_DEBIT, 524, "1 000,00"),
      t(305, 512, 53, "7010.000000000"),
      t(374, 512, 40, "PROVISIONS TEST"),
      t(35, 500, 20, "AFCC"),
      t(74, 500, 35, "01/07/2024"),
      t(374, 500, 40, "Appel test"),
      montant(X1_CREDIT, 500, "1 000,00"),
      t(374, 488, 99, "Total Compte 7010.000000000"),
      montant(X1_CREDIT, 488, "1 000,00"),
    ];
    const res = parserGrandLivreColonnesDroite([page(items)]);
    const jeu = normaliserGrandLivre({ lignes: res.lignes, notes: [] });
    const equ = verifierEquilibreGrandLivre(jeu.lignes);
    expect(equ.equilibre).toBe(true);
    expect(res.anomalies).toEqual([]);
  });
});
