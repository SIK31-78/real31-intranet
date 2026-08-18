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

// --- Mise en page MATERA (mesuree sur le GL 2026 de S0303, donnees 100 % synthetiques) -----
// Specificites reelles reproduites ici : titres dessines DEUX FOIS (faux gras), en-tete de
// compte "NNN - Libelle" dans un seul item, dates en toutes lettres, ligne "Total" seule en
// fin de bloc, recapitulatif de section ("Total 103 - ..."), et libelles de virement SEPA
// contenant "Creditor Name" (le voleur d'ancre Credit).
describe("parserGrandLivrePositions - mise en page Matera", () => {
  // Colonnes Matera : Debit ~614, Credit ~674, Solde debiteur ~723, Solde crediteur ~784.
  function enteteMatera(y: number): ItemTexte[] {
    return [
      t(32, y, 16, "Date"),
      t(110, y, 43, "Contrepartie"),
      t(173, y, 23, "Libellé"),
      t(605, y, 18, "Débit"),
      t(664, y, 21, "Crédit"),
      t(698, y, 50, "Solde débiteur"),
      t(758, y, 52, "Solde créditeur"),
    ];
  }
  /** Item dessine deux fois au meme endroit (faux gras des titres Matera). */
  function double(x: number, y: number, largeur: number, chaine: string): ItemTexte[] {
    return [t(x, y, largeur, chaine), t(x, y, largeur, chaine)];
  }

  function pageMatera(): PageTexte {
    return page([
      // Tete de section (doublee) puis tete de compte (doublee) : "numero - libelle" en UN item.
      ...double(30, 560, 120, "105 - Fonds de travaux"),
      ...double(30, 540, 200, "105001 - Fonds travaux - VENDOME PAULINE"),
      ...enteteMatera(520),
      // Ecriture en toutes lettres, credit (appel de fonds) + solde crediteur (exclu).
      t(33, 500, 49, "01 janvier 2026"),
      t(111, 500, 24, "450001"),
      t(174, 500, 90, "Appel de fonds pour Fonds travaux"),
      t(660, 500, 24, "22,85 €"),
      t(785, 500, 24, "22,85 €"),
      // A-nouveau : report capture, pas une ecriture.
      t(33, 480, 49, "01 janvier 2026"),
      t(111, 480, 24, "Aucune"),
      t(174, 480, 85, "Report à nouveau fin 2025"),
      t(660, 480, 24, "114,45 €"),
      t(785, 480, 26, "137,30 €"),
      // Ligne "Total" seule : total du compte capture, bloc CLOS.
      t(33, 460, 20, "Total"),
      t(600, 460, 24, "0,00 €"),
      t(660, 460, 26, "137,30 €"),
      t(785, 460, 26, "137,30 €"),
      // Recapitulatif de section : en-tete de colonnes repete + "Total 105 - ..." + Total.
      ...double(30, 440, 130, "Total 105 - Fonds de travaux"),
      ...enteteMatera(420),
      t(33, 400, 20, "Total"),
      t(600, 400, 24, "0,00 €"),
      t(660, 400, 26, "137,30 €"),
      t(785, 400, 26, "137,30 €"),
    ]);
  }

  it("lit l'en-tete 'numero - libelle', dedoublonne le faux gras et capture l'intitule", () => {
    const r = parserGrandLivrePositions([pageMatera()]);
    expect(r.lignes).toHaveLength(1);
    expect(r.lignes[0]).toMatchObject({ compte: "105001", sens: "credit", montant: 22.85 });
    expect(r.intitules?.["105001"]).toBe("Fonds travaux - VENDOME PAULINE");
    // La date en toutes lettres est NORMALISEE en JJ/MM/AAAA.
    expect(r.lignes[0]!.date).toBe("01/01/2026");
  });

  it("capture report et total du bloc, et le recap de section n'ECRASE pas le total du compte", () => {
    const r = parserGrandLivrePositions([pageMatera()]);
    const ctrl = r.controles?.find((c) => c.compte === "105001");
    expect(ctrl).toMatchObject({ reportCredit: 114.45, totalCredit: 137.3 });
    // Le "Total" du recapitulatif de section (apres "Total 105 - ...") ne cree AUCUN controle
    // fantome : le bloc a ete clos par le "Total" seul puis par le total de section.
    expect(r.controles?.filter((c) => c.compte === "105001")).toHaveLength(1);
    expect(r.controles?.some((c) => c.compte === "105")).toBe(false);
    // Reconciliation exacte : report + ecritures == total imprime (via le normaliseur,
    // comme dans le pipeline reel).
    const jeu = normaliserGrandLivre({ lignes: r.lignes, notes: [] });
    const verdict = verifierTotauxParCompte(jeu.lignes, r.controles ?? []);
    expect(verdict.enEcart).toHaveLength(0);
  });

  it("'Creditor Name' dans un libelle SEPA ne vole pas l'ancre Credit", () => {
    const p = page([
      ...double(30, 560, 180, "512001 - Banque du syndicat"),
      ...enteteMatera(540),
      // Ligne 1 : virement entrant, libelle SEPA avec "Creditor Name" DANS la fenetre de
      // detection (les 2 lignes sous l'en-tete) - le piege reel de la page 14.
      t(33, 520, 49, "09 février 2026"),
      t(111, 520, 24, "450003"),
      t(174, 520, 310, "Virement - CLIENT TEST - Creditor Name SEPA : COPRO TEST"),
      t(593, 520, 28, "404,92 €"),
      t(712, 520, 34, "1 972,99 €"),
      // Ligne 2 : reglement sortant -> CREDIT (c'est lui qui etait perdu).
      t(33, 500, 49, "16 février 2026"),
      t(111, 500, 24, "401009"),
      t(174, 500, 100, "Règlement - EDF - EDF -"),
      t(664, 500, 22, "200,16 €"),
      t(712, 500, 34, "1 772,83 €"),
    ]);
    const r = parserGrandLivrePositions([p]);
    expect(r.lignes).toHaveLength(2);
    expect(r.lignes[0]).toMatchObject({ sens: "debit", montant: 404.92 });
    // Sans le matching par tokens exacts, cette ligne etait ECARTEE (credit vole a x~330).
    expect(r.lignes[1]).toMatchObject({ sens: "credit", montant: 200.16 });
  });
});
