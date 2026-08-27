// Tests du parseur RGD : items 100 % SYNTHETIQUES (aucun nom ni montant reel) reproduisant
// la geometrie des deux formats reels (Matera S0303/S0304, Foncia S0304). Chaque piege
// documente a son test : faux gras (items dupliques ET caracteres doubles, jamais sur les
// chiffres), colonne TVA omise quand elle est nulle, titre de poste replie, page de
// synthese, millesime imitant un compte, journal d'anomalies a zero.
import { describe, expect, it } from "vitest";
import {
  dedupliquerItems,
  deplierFauxGras,
  detecterFormatRgd,
  extraireMontantsEuro,
  parserRgd,
  parserRgdFoncia,
  parserRgdMatera,
} from "../parseur-rgd";
import { reconstruireLignes, type ItemTexte, type PageTexte } from "../pdf-texte";

function t(x: number, y: number, largeur: number, chaine: string): ItemTexte {
  return { x, y, largeur, chaine };
}

function page(items: ItemTexte[]): PageTexte {
  return { largeur: 595, hauteur: 842, lignes: reconstruireLignes(items), nbItems: items.length };
}

/** Montant euro cale a droite sur le x1 de sa colonne. */
function mE(x1: number, y: number, chaine: string): ItemTexte {
  const largeur = chaine.length * 4;
  return t(x1 - largeur, y, largeur, chaine);
}

describe("deplierFauxGras - tokens alphabetiques UNIQUEMENT", () => {
  it("deplie un token en caracteres doubles", () => {
    expect(deplierFauxGras("GGrraanndd")).toBe("Grand");
    expect(deplierFauxGras("LLiivvrree")).toBe("Livre");
  });
  it("ne touche JAMAIS un token numerique (11 917,04 ne devient pas 1 917,04)", () => {
    // Non-regression du skill : montant dont les milliers commencent par deux chiffres identiques.
    expect(deplierFauxGras("11")).toBe("11");
    expect(deplierFauxGras("1111")).toBe("1111");
    expect(deplierFauxGras("11 917,04")).toBe("11 917,04");
  });
  it("laisse un token mixte non double tel quel", () => {
    expect(deplierFauxGras("Grand")).toBe("Grand");
    expect(deplierFauxGras("EDF")).toBe("EDF");
  });
});

describe("dedupliquerItems - faux gras rendu en items dupliques (pdfjs)", () => {
  it("garde un seul exemplaire d'un item imprime deux fois au meme endroit", () => {
    const items = [t(33, 100, 80, "Charges générales"), t(33.5, 100, 80, "Charges générales")];
    expect(dedupliquerItems(items)).toHaveLength(1);
  });
  it("garde deux montants identiques imprimes a des positions differentes", () => {
    const items = [mE(385, 100, "330,00 €"), mE(502, 100, "330,00 €")];
    expect(dedupliquerItems(items)).toHaveLength(2);
  });
});

describe("extraireMontantsEuro", () => {
  it("lit un montant complet symbole attache, negatif compris", () => {
    const g = extraireMontantsEuro([mE(382, 100, "-2 700,00 €")]);
    expect(g).toHaveLength(1);
    expect(g[0]!.valeur).toBe(-2700);
  });
  it("recolle la forme eclatee '1' + '811,63' + '€' (rendu pdfplumber)", () => {
    const g = extraireMontantsEuro([t(340, 100, 4, "1"), t(346, 100, 24, "811,63"), t(372, 100, 8, "€")]);
    expect(g).toHaveLength(1);
    expect(g[0]!.valeur).toBe(1811.63);
    expect(g[0]!.x1).toBe(380);
  });
  it("ignore un texte qui contient un euro sans etre un montant (pied de page)", () => {
    expect(extraireMontantsEuro([t(45, 100, 400, "CAPITAL 119298.88 € - RCS FICTIF")])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------
// FONCIA : ancres A REPARTIR x1=382 | DONT TVA x1=451 | CHARGES RECUPERABLES x1=540.
// ---------------------------------------------------------------------------------------

function enTetesFoncia(y: number): ItemTexte[] {
  return [
    t(376, y + 9, 6, "À"),
    t(426, y + 9, 25, "DONT"),
    t(496, y + 9, 44, "CHARGES"),
    t(338, y, 44, "RÉPARTIR"),
    t(434, y, 17, "TVA"),
    t(467, y, 73, "RÉCUPÉRABLES"),
  ];
}

function pagesFoncia(): PageTexte[] {
  // Page 1 : synthese (des montants, aucune depense) - a ecarter sans anomalie.
  const p1 = page([
    t(255, 800, 300, "Relevé général de dépenses"),
    t(60, 760, 191, "SYNTHÈSE DE DÉPENSES"),
    ...enTetesFoncia(740),
    t(69, 720, 158, "Dépenses engagées pour l'immeuble"),
    mE(382, 720, "402,70 €"),
    mE(451, 720, "45,70 €"),
    mE(540, 720, "172,70 €"),
    t(69, 708, 100, "DEPENSES GENERALES"),
    mE(382, 708, "292,86 €"),
    mE(451, 708, "35,15 €"),
    mE(540, 708, "172,70 €"),
  ]);
  // Page 2 : postes de la cle 001, dont un poste NEGATIF et un TITRE REPLIE.
  let y = 800;
  const suiv = (pas = 12) => (y -= pas);
  const items2: ItemTexte[] = [t(60, y, 176, "DÉPENSES GENERALES"), ...enTetesFoncia((y -= 14))];
  suiv();
  items2.push(
    t(69, y, 148, "CONTRAT D'ENTRETIEN. (001.100)"),
    mE(382, y, "172,70 €"),
    mE(451, y, "15,70 €"),
    mE(540, y, "172,70 €"),
  );
  suiv();
  items2.push(t(69, y, 52, "6140.000000000"));
  suiv();
  items2.push(
    t(69, y, 42, "05/08/2024"),
    t(128, y, 100, "AVH FICTIF - 07/2024"),
    mE(382, y, "172,70 €"),
    mE(451, y, "15,70 €"),
    mE(540, y, "172,70 €"),
  );
  // Repli de libelle sans montant : ignore.
  suiv();
  items2.push(t(128, y, 100, "COMPLEMENT DU LIBELLE - 27/12/24"));
  // Poste negatif (avoir / interets de retard).
  suiv();
  items2.push(
    t(69, y, 225, "INTERETS DE RETARD COPROPRIETAIRE. (001.862)"),
    mE(382, y, "-7,87 €"),
    mE(451, y, "0,00 €"),
    mE(540, y, "0,00 €"),
  );
  suiv();
  items2.push(t(69, y, 52, "7180.000000000"));
  suiv();
  items2.push(
    t(69, y, 42, "26/08/2024"),
    t(128, y, 121, "Intérêts de retard au 26/08/2024"),
    mE(382, y, "-3,39 €"),
    mE(451, y, "0,00 €"),
    mE(540, y, "0,00 €"),
  );
  suiv();
  items2.push(
    t(69, y, 42, "03/12/2024"),
    t(128, y, 121, "Intérêts de retard au 03/12/2024"),
    mE(382, y, "-4,48 €"),
    mE(451, y, "0,00 €"),
    mE(540, y, "0,00 €"),
  );
  // TITRE REPLIE : montants sur la ligne-titre, marqueur seul sur la suivante.
  suiv();
  items2.push(
    t(69, y, 211, "FORMATION PROFESSIONNELLE GARDIEN 75%."),
    mE(382, y, "103,84 €"),
    mE(451, y, "0,00 €"),
    mE(540, y, "77,89 €"),
  );
  suiv();
  items2.push(t(69, y, 38, "(001.554)"));
  suiv();
  items2.push(t(69, y, 52, "6420.000000000"));
  suiv();
  items2.push(
    t(69, y, 42, "12/09/2024"),
    t(128, y, 93, "AGEFOS ANNUEL 2023"),
    mE(382, y, "51,18 €"),
    mE(451, y, "0,00 €"),
    mE(540, y, "38,39 €"),
  );
  suiv();
  items2.push(
    t(69, y, 42, "23/12/2024"),
    t(128, y, 93, "AGEFOS ANNUEL 2024"),
    mE(382, y, "52,66 €"),
    mE(451, y, "0,00 €"),
    mE(540, y, "39,50 €"),
  );
  // Total de la cle : somme des totaux de postes (172,70 - 7,87 + 103,84 = 268,67).
  suiv();
  items2.push(
    t(69, y, 130, "Total DÉPENSES GENERALES"),
    mE(382, y, "268,67 €"),
    mE(451, y, "15,70 €"),
    mE(540, y, "250,59 €"),
  );
  // Pied de page publicitaire (euro dans du texte : jamais un montant, jamais une anomalie).
  items2.push(t(45, 30, 400, "N° TVA INTRACOMMUNAUTAIRE : FR000 CAPITAL 119298.88 € - RCS FICTIF"));
  return [p1, page(items2)];
}

describe("parserRgdFoncia", () => {
  const res = parserRgdFoncia(pagesFoncia());

  it("detecte le format et extrait les depenses avec la cle du marqueur (cle.poste)", () => {
    expect(detecterFormatRgd(pagesFoncia())).toBe("foncia");
    expect(res.lignes).toHaveLength(5);
    expect(res.lignes[0]).toMatchObject({
      date: "2024-08-05",
      compte: "6140.000000000",
      cle: "001",
      ttc: 172.7,
      tva: 15.7,
      recuperable: 172.7,
    });
  });

  it("garde le signe des avoirs (montants negatifs)", () => {
    const negatifs = res.lignes.filter((l) => l.ttc < 0);
    expect(negatifs.map((l) => l.ttc)).toEqual([-3.39, -4.48]);
    expect(negatifs[0]!.compte).toBe("7180.000000000");
  });

  it("rattache un TITRE REPLIE a son marqueur (001.554) avec ses totaux", () => {
    const c554 = res.controles.find((c) => c.code === "001.554");
    expect(c554).toMatchObject({ niveau: "poste", ttcImprime: 103.84, ttcCalcule: 103.84, ecart: 0 });
    const agefos = res.lignes.filter((l) => l.compte === "6420.000000000");
    expect(agefos).toHaveLength(2);
    expect(agefos.every((l) => l.cle === "001")).toBe(true);
  });

  it("reconcilie chaque poste et le total de cle a 0 ecart", () => {
    expect(res.controles.filter((c) => c.niveau === "poste")).toHaveLength(3);
    expect(res.controles.every((c) => Math.abs(c.ecart) < 0.005)).toBe(true);
    const cle = res.controles.find((c) => c.niveau === "cle");
    expect(cle).toMatchObject({ code: "001", ttcImprime: 268.67, ttcCalcule: 268.67 });
  });

  it("ecarte la page de synthese sans anomalie ; journal d'anomalies a ZERO", () => {
    expect(res.anomalies).toEqual([]);
  });
});

describe("parserRgdFoncia - anomalies", () => {
  it("consigne une ligne a montants qui n'est ni poste, ni depense, ni total", () => {
    const items: ItemTexte[] = [
      ...enTetesFoncia(800),
      t(69, 780, 148, "CONTRAT D'ENTRETIEN. (001.100)"),
      mE(382, 780, "10,00 €"),
      t(69, 768, 52, "6140.000000000"),
      // Montants sur une ligne sans date ni marqueur, non suivie d'un marqueur : anomalie.
      t(69, 756, 90, "Régularisation inconnue"),
      mE(382, 756, "99,99 €"),
      t(69, 744, 42, "01/09/2024"),
      t(128, 744, 60, "FICTIF SAS"),
      mE(382, 744, "10,00 €"),
    ];
    const res = parserRgdFoncia([page(items)]);
    expect(res.anomalies).toHaveLength(1);
    expect(res.anomalies[0]!.texte).toContain("Régularisation");
    expect(res.lignes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------
// MATERA : ancres Montant total x1=386 | TVA incluse x1=445 | Recuperable x1=504 |
// Deductible x1=563 ; marge gauche calee sur l'en-tete "Date" (x0=32).
// ---------------------------------------------------------------------------------------

function enTetesMatera(y: number): ItemTexte[] {
  return [
    t(32, y, 16, "Date"),
    t(113, y, 22, "Libellé"),
    t(341, y, 45, "Montant total"),
    t(404, y, 41, "TVA incluse"),
    t(461, y, 43, "Récupérable"),
    t(526, y, 37, "Déductible"),
  ];
}

/** Item duplique (faux gras pdfjs) : deux exemplaires quasi superposes. */
function gras(x: number, y: number, largeur: number, chaine: string): ItemTexte[] {
  return [t(x, y, largeur, chaine), t(x + 0.5, y, largeur, chaine)];
}

function pagesMatera(): PageTexte[] {
  let y = 800;
  const suiv = (pas = 12) => (y -= pas);
  const items: ItemTexte[] = [...enTetesMatera(y)];
  // Section de cle generale (en gras -> items dupliques).
  suiv();
  items.push(...gras(33, y, 81, "Charges générales"));
  // Compte en gras.
  suiv();
  items.push(...gras(33, y, 130, "602001 - Electricité fictive"));
  // Depense 4 colonnes.
  suiv();
  items.push(
    t(33, y, 44, "29 mars 2025"),
    t(114, y, 57, "EDF - 03/2025"),
    mE(385, y, "138,04 €"),
    mE(444, y, "15,55 €"),
    mE(502, y, "138,04 €"),
    mE(562, y, "0,00 €"),
  );
  // Depense avec la colonne TVA OMISE (3 montants seulement) et milliers a deux chiffres
  // identiques (non-regression faux gras : 11 917,04 reste 11 917,04).
  suiv();
  items.push(
    t(33, y, 48, "12 avril 2025"),
    t(114, y, 80, "GROS ENTRETIEN"),
    mE(385, y, "11 917,04 €"),
    mE(502, y, "11 917,04 €"),
    mE(562, y, "0,00 €"),
  );
  // Total du compte (label a gauche, montants aux ancres).
  suiv();
  items.push(
    t(33, y, 140, "Total 602001 - Electricité fictive"),
    mE(385, y, "12 055,08 €"),
    mE(444, y, "15,55 €"),
    mE(502, y, "12 055,08 €"),
    mE(562, y, "0,00 €"),
  );
  // Libelle SEPA replie imitant un compte : millesime refuse (garde S0304).
  suiv();
  items.push(t(33, y, 160, "2026 - Creditor Name SEPA : RESIDENCE FICTIVE"));
  // Section a CODE en capitales -> cle = code.
  suiv();
  items.push(...gras(33, y, 120, "700 - DEPENSES CHAUFFAGE"));
  suiv();
  items.push(...gras(33, y, 170, "614013 - Contrats de chauffage - 700 - DEPENSES CHAUFFAGE"));
  suiv();
  items.push(
    t(33, y, 55, "01 avril 2025"),
    t(114, y, 60, "STATE - P2"),
    mE(385, y, "500,00 €"),
    mE(444, y, "45,45 €"),
    mE(502, y, "500,00 €"),
    mE(562, y, "0,00 €"),
  );
  // Repli de libelle en colonne Libelle : ignore.
  suiv();
  items.push(t(114, y, 90, "COMPLEMENT 03/2025"));
  // Total de section sans code : ignore. Puis total general reconcilie.
  suiv();
  items.push(t(33, y, 90, "Total Escalier E"), mE(385, y, "0,00 €"));
  suiv();
  items.push(
    t(33, y, 60, "Total général"),
    mE(385, y, "12 555,08 €"),
    mE(444, y, "61,00 €"),
    mE(502, y, "12 555,08 €"),
    mE(562, y, "0,00 €"),
  );
  suiv();
  items.push(t(510, y, 51, "Page 1 sur 1"));
  return [page(items)];
}

describe("parserRgdMatera", () => {
  const res = parserRgdMatera(pagesMatera());

  it("detecte le format et extrait les depenses avec cle, compte et 4 colonnes", () => {
    expect(detecterFormatRgd(pagesMatera())).toBe("matera");
    expect(res.lignes).toHaveLength(3);
    expect(res.lignes[0]).toMatchObject({
      date: "2025-03-29",
      compte: "602001",
      cle: "001",
      ttc: 138.04,
      tva: 15.55,
      recuperable: 138.04,
      deductible: 0,
    });
  });

  it("ne dedouble JAMAIS un montant : 11 917,04 reste entier meme avec la TVA omise", () => {
    expect(res.lignes[1]).toMatchObject({ ttc: 11917.04, recuperable: 11917.04, deductible: 0 });
    expect(res.lignes[1]!.tva).toBeUndefined(); // colonne TVA absente de cette ligne
  });

  it("suit la section a code en capitales comme cle (700) et le compte en casse mixte", () => {
    expect(res.lignes[2]).toMatchObject({ compte: "614013", cle: "700", ttc: 500 });
  });

  it("refuse un millesime comme compte (2026 - Creditor Name)", () => {
    expect(res.lignes.every((l) => l.compte !== "2026")).toBe(true);
  });

  it("reconcilie le total de compte et le total general a 0 ecart", () => {
    const compte = res.controles.find((c) => c.niveau === "compte" && c.code === "602001");
    expect(compte).toMatchObject({ ttcImprime: 12055.08, ttcCalcule: 12055.08, ecart: 0 });
    const general = res.controles.find((c) => c.niveau === "general");
    expect(general).toMatchObject({ ttcImprime: 12555.08, ttcCalcule: 12555.08, ecart: 0 });
  });

  it("journal d'anomalies a ZERO sur la page complete", () => {
    expect(res.anomalies).toEqual([]);
  });
});

describe("parserRgd - point d'entree", () => {
  it("route vers le bon format et leve une erreur explicite sur un format inconnu", () => {
    expect(parserRgd(pagesMatera()).lignes).toHaveLength(3);
    expect(parserRgd(pagesFoncia()).lignes).toHaveLength(5);
    const inconnu = page([t(33, 100, 60, "Un document"), t(120, 100, 60, "quelconque")]);
    expect(() => parserRgd([inconnu])).toThrowError(/Format de RGD non reconnu/);
  });
});
