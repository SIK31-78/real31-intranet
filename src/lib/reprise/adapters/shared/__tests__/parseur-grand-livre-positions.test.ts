// Tests du parseur POSITIONNE : items 100 % SYNTHETIQUES (inventes) reproduisant la mise en page
// reelle d'un grand livre a colonnes Debit/Credit DOUBLEES par des colonnes de solde progressif
// (la valeur du mouvement est repetee dans la colonne de solde -> piege qui corrompt l'OCR). On
// verifie que seules les colonnes de MOUVEMENT sont retenues, que reports/sous-totaux sont exclus,
// que les totaux et a-nouveaux sont captures, et que la reconciliation par compte tombe a 0.
import { describe, expect, it } from "vitest";
import {
  parserGrandLivrePositions,
  detecterColonnes,
} from "../parseur-grand-livre-positions";
import { reconstruireLignes, type ItemTexte, type PageTexte } from "../pdf-texte";
import { normaliserGrandLivre } from "../normaliser-compta";
import { verifierEquilibreGrandLivre } from "@/lib/reprise/domain/ecriture";
import { verifierTotauxParCompte } from "@/lib/reprise/domain/controle-comptes";

function t(x: number, y: number, largeur: number, chaine: string): ItemTexte {
  return { x, y, largeur, chaine };
}

function page(items: ItemTexte[]): PageTexte {
  const lignes = reconstruireLignes(items);
  return { largeur: 842, hauteur: 595, lignes, nbItems: items.length };
}

// En-tete commun : Debit centre ~650, Credit ~695, Solde Debiteur ~735, Solde Crediteur ~774,
// Solde ~815. Zone montants a droite de ~630 ; zone texte a gauche.
function entete(y: number): ItemTexte[] {
  return [
    // ligne du dessus : "Solde" (deux colonnes de solde a droite)
    t(745, y + 9, 20, "Solde"),
    t(805, y + 9, 20, "Solde"),
    // ligne principale : contient "Debit" ET "Credit"
    t(10, y, 20, "C.J"),
    t(40, y, 40, "Date"),
    t(240, y, 40, "Ecriture"),
    t(290, y, 40, "Compte"),
    t(470, y, 40, "Libelle"),
    t(640, y, 20, "Debit"),
    t(685, y, 20, "Credit"),
    // ligne du dessous : sous-en-tetes de solde
    t(715, y - 9, 40, "Debiteur"),
    t(754, y - 9, 40, "Crediteur"),
  ];
}

describe("detecterColonnes - reconnaissance des colonnes par en-tetes imprimes", () => {
  it("trouve Debit/Credit et classe Solde/Debiteur/Crediteur en exclusions", () => {
    const col = detecterColonnes(page(entete(500)));
    expect(col).not.toBeNull();
    expect(col!.debitX).toBeCloseTo(650, 0);
    expect(col!.creditX).toBeCloseTo(695, 0);
    // 3 en-tetes de solde/cumul (Solde x2 + Debiteur + Crediteur) tous ecartes.
    expect(col!.exclusionsX.length).toBeGreaterThanOrEqual(3);
    expect(col!.montantMinX).toBeCloseTo(630, 0);
  });

  it("renvoie null si une seule colonne de mouvement (presentation montant-signe)", () => {
    // En-tete "Montant" + "Sens" : ni Debit ni Credit -> le natif ne s'applique pas, fallback OCR.
    const p = page([t(10, 500, 20, "C.J"), t(500, 500, 60, "Montant"), t(600, 500, 40, "Sens")]);
    expect(detecterColonnes(p)).toBeNull();
  });
});

describe("parserGrandLivrePositions - extraction et reconciliation", () => {
  // Un compte (avances de tresorerie) : report credit d'ouverture + une ecriture debit et une
  // ecriture credit. Chaque montant de mouvement est DUPLIQUE dans les colonnes de solde (pieges).
  const items: ItemTexte[] = [
    ...entete(500),
    // en-tete de compte : numero (zone Compte) + nom (zone Libelle), aucun montant
    t(280, 481, 60, "1031.000000000"),
    t(350, 481, 120, "AVANCES DE TRESORERIE"),
    // solde anterieur : report credit 9 614,00 (col credit ~700) + 2 duplicatas de solde a ignorer
    t(350, 472, 90, "Solde anterieur"),
    t(688, 472, 24, "9 614,00"),
    t(743, 472, 24, "9 614,00"),
    t(803, 472, 24, "9 614,00"),
    // ecriture DEBIT 143,17 (col debit ~655) + duplicata solde-debiteur (~728) + solde (~815)
    t(10, 463, 20, "VECC"),
    t(40, 463, 60, "24/10/2025"),
    t(240, 463, 20, "176"),
    t(350, 463, 200, "Remboursement avance de tresorerie"),
    t(643, 463, 24, "143,17"),
    t(716, 463, 24, "143,17"),
    t(795, 463, 40, "9 470,83"),
    // ecriture CREDIT 143,17 (col credit ~700) + duplicata solde-crediteur (~761) + solde (~815)
    t(10, 454, 20, "VECC"),
    t(40, 454, 60, "24/10/2025"),
    t(240, 454, 20, "178"),
    t(350, 454, 200, "Appel avance de tresorerie"),
    t(688, 454, 24, "143,17"),
    t(749, 454, 24, "143,17"),
    t(795, 454, 40, "9 614,00"),
    // TOTAL MOIS : a EXCLURE (porte pourtant des montants qui ne doivent pas etre comptes)
    t(350, 445, 120, "Total Mois 2025/10"),
    t(643, 445, 24, "143,17"),
    t(688, 445, 24, "143,17"),
    // TOTAL COMPTE : capture. debit 143,17 ; credit 9 757,17 (= report 9614 + 143,17)
    t(350, 436, 200, "Total Compte 1031.000000000"),
    t(643, 436, 24, "143,17"),
    t(680, 436, 40, "9 757,17"),
  ];

  const res = parserGrandLivrePositions([page(items)]);

  it("extrait exactement les 2 ecritures de mouvement (ignore soldes progressifs et total mois)", () => {
    expect(res.lignes).toHaveLength(2);
    const debit = res.lignes.find((l) => l.sens === "debit")!;
    const credit = res.lignes.find((l) => l.sens === "credit")!;
    expect(debit.montant).toBeCloseTo(143.17, 2);
    expect(credit.montant).toBeCloseTo(143.17, 2);
    // Le compte courant est bien propage aux ecritures depuis l'en-tete de compte.
    expect(debit.compte).toBe("1031.000000000");
    expect(credit.compte).toBe("1031.000000000");
    // La date est extraite de la zone texte.
    expect(debit.date).toBe("24/10/2025");
  });

  it("capture le total imprime et le report a-nouveau du compte", () => {
    expect(res.controles).toHaveLength(1);
    const c = res.controles[0]!;
    expect(c.compte).toBe("1031.000000000");
    expect(c.totalDebit).toBeCloseTo(143.17, 2);
    expect(c.totalCredit).toBeCloseTo(9757.17, 2);
    expect(c.reportCredit).toBeCloseTo(9614, 2);
  });

  it("la reconciliation par compte tombe a 0 (report + ecritures == total imprime)", () => {
    const jeu = normaliserGrandLivre({ lignes: res.lignes, notes: res.notes });
    const ctrl = verifierTotauxParCompte(jeu.lignes, res.controles);
    expect(ctrl.nbComptesControles).toBe(1);
    expect(ctrl.nbEnEcart).toBe(0);
    // L'equilibre global (debit == credit sur les mouvements) est parfait.
    const equ = verifierEquilibreGrandLivre(jeu.lignes);
    expect(equ.equilibre).toBe(true);
    expect(equ.ecart).toBe(0);
  });
});

describe("parserGrandLivrePositions - nombres francais et colonnes larges", () => {
  it("lit un montant '1 234,56' dans la bonne colonne malgre la largeur variable", () => {
    const items: ItemTexte[] = [
      ...entete(500),
      t(280, 481, 60, "6110.000000000"),
      t(350, 481, 120, "EAU"),
      // ecriture debit 1 234,56 (nombre large, colonne debit) + duplicata solde
      t(10, 463, 20, "FACT"),
      t(40, 463, 60, "05/11/2025"),
      t(350, 463, 200, "Consommation eau"),
      t(628, 463, 36, "1 234,56"),
      t(700, 463, 36, "1 234,56"),
    ];
    const res = parserGrandLivrePositions([page(items)]);
    expect(res.lignes).toHaveLength(1);
    expect(res.lignes[0]!.sens).toBe("debit");
    expect(res.lignes[0]!.montant).toBeCloseTo(1234.56, 2);
    expect(res.lignes[0]!.compte).toBe("6110.000000000");
  });

  it("herite du modele de colonnes de la page precedente si une page n'a pas d'en-tete", () => {
    const pageAvecEntete = page([
      ...entete(500),
      t(280, 481, 60, "5120.000000000"),
      t(350, 481, 120, "BANQUE"),
    ]);
    // page de continuation : PAS d'en-tete Debit/Credit, juste une ecriture -> doit reutiliser
    // les colonnes de la page precedente.
    const pageContinuation = page([
      t(10, 400, 20, "BQEN"),
      t(40, 400, 60, "02/10/2025"),
      t(350, 400, 200, "Prelevement"),
      t(688, 400, 24, "458,76"),
      t(749, 400, 24, "458,76"),
    ]);
    const res = parserGrandLivrePositions([pageAvecEntete, pageContinuation]);
    expect(res.lignes).toHaveLength(1);
    expect(res.lignes[0]!.sens).toBe("credit");
    expect(res.lignes[0]!.compte).toBe("5120.000000000");
  });
});

// --- Pieges du GL Matera S0304 (mesures en reel, rejoues ici en synthetique) --------------
// Geometrie de ce format : Date | Contrepartie | Libelle | Debit(~614) | Credit(~675) |
// Solde debiteur(~723) | Solde crediteur(~784). Montants suffixes " EUR" ("818,23 EUR"
// devient ici "818,23 €" - meme forme que le reel).
function enteteMatera(y: number): ItemTexte[] {
  return [
    t(32, y, 16, "Date"),
    t(110, y, 43, "Contrepartie"),
    t(173, y, 22, "Libellé"),
    t(605, y, 18, "Débit"),
    t(664, y, 21, "Crédit"),
    t(698, y, 50, "Solde débiteur"),
    t(758, y, 52, "Solde créditeur"),
  ];
}

describe("parserGrandLivrePositions - pieges du GL Matera S0304", () => {
  it("un libelle 'Creditor Name SEPA' pres des en-tetes ne VOLE PAS l'ancre credit", () => {
    // Le piege du skill : detecte par tokens EXACTS, jamais includes(). Ici le libelle SEPA
    // est sur la ligne JUSTE SOUS les en-tetes (dans la fenetre de detection).
    const items: ItemTexte[] = [
      ...enteteMatera(500),
      t(174, 491, 200, "Virement - Creditor Name SEPA : MATERA"),
      t(33, 482, 40, "09 juin 2025"),
      t(111, 482, 24, "450025"),
      t(593, 482, 28, "705,77 €"),
      t(712, 482, 34, "9 911,49 €"),
    ];
    const col = detecterColonnes(page(items));
    expect(col).not.toBeNull();
    expect(col!.creditX).toBeCloseTo(674.5, 0); // l'en-tete imprime, pas le libelle SEPA
    // Sans la garde, 705,77 (centre ~607) partirait vers l'ancre volee : ici il reste au debit.
    const l = parserGrandLivrePositions([
      page([t(28, 509, 90, "450025 - COPRO TEST"), ...items]),
    ]).lignes;
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ sens: "debit", montant: 705.77 });
  });

  it("reconnait l'en-tete de compte en UN item, refuse le millesime, et suit section puis feuille", () => {
    const items: ItemTexte[] = [
      ...enteteMatera(500),
      t(28, 491, 91, "103 - Avances"), // section
      t(28, 482, 141, "1031001 - Avances de trésorerie"), // feuille (recoit les lignes)
      // Faux gras pdfjs : le meme en-tete imprime deux fois, quasi superpose.
      t(28.5, 482, 141, "1031001 - Avances de trésorerie"),
      // Libelle SEPA replie imitant un en-tete : millesime refuse (garde S0304).
      t(28, 473, 160, "2026 - Creditor Name SEPA : RESIDENCE TEST"),
      t(33, 464, 44, "01 avril 2025"),
      t(111, 464, 24, "450001"),
      t(174, 464, 112, "Appel de fonds pour Fonds travaux"),
      t(660, 464, 24, "40,52 €"),
      t(781, 464, 28, "255,69 €"),
    ];
    const res = parserGrandLivrePositions([page(items)]);
    expect(res.lignes).toHaveLength(1);
    expect(res.lignes[0]!.compte).toBe("1031001"); // la feuille, jamais "2026"
    expect(res.lignes[0]!.date).toBe("01/04/2025"); // date en toutes lettres convertie
    expect(res.intitules).toMatchObject({ "1031001": "Avances de trésorerie" });
  });

  it("capture le 'Total' NU du compte et ecarte le bloc recapitulatif de section", () => {
    const items: ItemTexte[] = [
      ...enteteMatera(500),
      t(28, 491, 141, "1031001 - Avances de trésorerie"),
      t(33, 482, 44, "01 avril 2025"),
      t(174, 482, 60, "Intérêts"),
      t(602, 482, 20, "1,31 €"),
      t(709, 482, 38, "52 548,24 €"),
      // Total NU du compte : capture (debit 1,31).
      t(33, 473, 17, "Total"),
      t(602, 473, 20, "1,31 €"),
      t(709, 473, 38, "52 548,24 €"),
      // Total de SECTION (Total + code + tiret) : exclu, et il CLOT le compte.
      t(28, 464, 120, "Total 103 - Avances"),
      // Bloc recapitulatif de la section : en-tetes repetes + Total NU portant le total de
      // SECTION - sans la cloture, il ecraserait le total de la feuille.
      ...enteteMatera(455),
      t(33, 446, 17, "Total"),
      t(584, 446, 38, "99 999,99 €"),
      t(646, 446, 38, "88 888,88 €"),
    ];
    const res = parserGrandLivrePositions([page(items)]);
    expect(res.lignes).toHaveLength(1);
    expect(res.controles).toHaveLength(1);
    // Le total du compte est celui de SA ligne "Total", jamais celui du recapitulatif.
    expect(res.controles[0]).toMatchObject({ compte: "1031001", totalDebit: 1.31 });
    expect(res.controles[0]!.totalDebit).not.toBeCloseTo(99999.99, 2);
  });
});
