// L'arbre de rendu du contrat : ce que l'ecran et le PDF dessinent. Retour du test du
// 17/09/2026 : « le pdf est mal genere notamment au niveau des tableaux ».

import { describe, expect, it } from "vitest";
import { assemblerChampsContrat, PRESTATIONS_CONTRAT, PRESTATIONS_MANDAT, type CoproContrat, type PrestationContrat } from "./champs-contrat";
import { htmlContrat } from "./html-contrat";
import { arbreContrat, estMontant, estTitre, type NoeudContrat } from "./rendu-contrat";
import { PLACEHOLDERS_MANDAT } from "./gabarit-mandat";
import { placeholdersNonResolus, tableRemplacement } from "./remplir-gabarit";

const COPRO: CoproContrat = {
  code: "S215",
  nom: "BLEUETS4",
  adresse1: "4 rue des Bleuets",
  adresse2: "",
  adresse3: "",
  codePostal: "92250",
  ville: "LA GARENNE-COLOMBES",
  immatriculation: "AI2016400",
  assurance: "AXA",
  assuranceDateISO: "2023-06-27",
  agence: "LGC",
  lotsPrincipaux: 18,
  lotsAutres: 18,
  nbVisites: 1,
  dureeAgHeures: 2,
  nbCs: 1,
  dureeCsHeures: 1,
  finMaxAgHeure: 22,
};

function champs(conditionsParticulieres?: string, copro: CoproContrat = COPRO) {
  const tarifs = {} as Record<PrestationContrat, { libelle: string; ttc: number }>;
  for (const p of [...PRESTATIONS_CONTRAT, ...PRESTATIONS_MANDAT]) tarifs[p] = { libelle: p, ttc: 120 };
  return assemblerChampsContrat(
    copro,
    { dateAgISO: "2026-10-22", debutISO: "2026-07-01", finISO: "2027-06-30", honorairesGestionTtc: 9419, forfaitPostauxTtc: 792 },
    tarifs,
    conditionsParticulieres,
  );
}

const tableaux = (noeuds: NoeudContrat[]) => noeuds.filter((n) => n.type === "tableau");
const titres = (noeuds: NoeudContrat[]) => noeuds.filter((n) => n.type === "titre").map((n) => n.texte);

describe("estTitre", () => {
  it("reconnait les titres numerotes, meme longs ou sur deux lignes", () => {
    expect(estTitre("2. DUREE DU CONTRAT")).toBe(true);
    expect(estTitre("7.1.3. Prestations optionnelles qui peuvent être incluses dans le forfait sur décision des parties")).toBe(true);
    expect(estTitre("7.2.2. Prestations relatives aux réunions et visites supplémentaires \n(au-delà du contenu du forfait stipulé aux 7.1.1 et 7.1.3)")).toBe(true);
  });
  it("laisse en paragraphe un montant ou une adresse qui commence par un nombre", () => {
    expect(estTitre("5597.50 € HT, soit 6717 € TTC.")).toBe(false);
    expect(estTitre("13 rond-point du Souvenir Français 92250 LA GARENNE-COLOMBES,")).toBe(false);
    expect(estTitre("78600 Maisons-Laffitte,")).toBe(false);
    expect(estTitre("8.4 Préparation, convocation")).toBe(true);
    expect(estTitre("5.3 Frais de délivrance")).toBe(true);
  });
  it("laisse en paragraphe un alinea qui commence par un numero", () => {
    expect(estTitre("8.4 Préparation, convocation et tenue d’une assemblée générale à la demande d’un ou plusieurs copropriétaires, pour des questions concernant leurs droits ou obligations (art. 17-1 AA de la loi du 10 juillet 1965)")).toBe(false);
    expect(estTitre("Le présent contrat est conclu pour une durée de 1 an.")).toBe(false);
  });
});

describe("estMontant", () => {
  it("reconnait un montant nu, pas une phrase tarifaire", () => {
    expect(estMontant("163.65")).toBe(true);
    expect(estMontant("1 234,00 €")).toBe(true);
    expect(estMontant("34.00 € HT soit 40.80 € TTC par lot principal")).toBe(false);
  });
});

describe("arbreContrat", () => {
  const a = arbreContrat(champs());

  const tous = [...tableaux(a.gauche), ...tableaux(a.droite)].filter((t) => t.type === "tableau");
  const lignesDe = (t: NoeudContrat) => (t.type === "tableau" ? t.lignes : []);

  it("dessine chaque tableau sur les huit cases du classeur, chaque ligne remplit sa largeur", () => {
    expect(tous.length).toBeGreaterThan(10);
    for (const t of tous) {
      expect(t.type === "tableau" && t.colonnes).toBe(8);
      // Une ligne sous une cellule haute a moins de cases ; jamais plus de huit.
      for (const l of lignesDe(t)) expect(l.cellules.reduce((n, c) => n + c.etendue, 0)).toBeLessThanOrEqual(8);
      // La premiere ligne et les en-tetes couvrent toute la largeur.
      expect(lignesDe(t)[0]!.cellules.reduce((n, c) => n + c.etendue, 0)).toBe(8);
    }
  });

  it("une grille tarifaire fait 4 + 4, une annexe 2 + 2 + 4 avec sa case vide au-dessus de la categorie", () => {
    const tarif = tous.find((t) => lignesDe(t)[0]?.cellules[0]?.texte === "DETAIL DE LA PRESTATION");
    expect(lignesDe(tarif!).map((l) => l.cellules.map((c) => c.etendue))[0]).toEqual([4, 4]);
    const annexe = tous.find((t) => lignesDe(t).some((l) => l.cellules[0]?.texte === "I. - Assemblée générale"));
    expect(lignesDe(annexe!)[0]!.cellules.map((c) => [c.texte, c.etendue])).toEqual([["", 2], ["PRESTATIONS", 2], ["DÉTAILS", 4]]);
  });

  it("garde un seul en-tete par tableau, en premiere ligne, et aucun tableau fait d'un en-tete seul", () => {
    for (const t of tous) {
      const lignes = lignesDe(t);
      expect(lignes.some((l) => !l.enTete)).toBe(true);
      expect(lignes.map((l, i) => (l.enTete ? i : -1)).filter((i) => i >= 0).every((i) => i === 0)).toBe(true);
    }
    expect(tous.filter((t) => lignesDe(t)[0]?.enTete).length).toBeGreaterThan(5);
  });

  it("la categorie de l'annexe 1 est une cellule haute, dessinee une fois", () => {
    const annexe = tous.find((t) => lignesDe(t).some((l) => l.cellules[0]?.texte === "I. - Assemblée générale"))!;
    const tete = lignesDe(annexe).find((l) => l.cellules[0]?.texte === "I. - Assemblée générale")!;
    expect(tete.cellules[0]!.portee).toBe(3);
    const suivante = lignesDe(annexe)[lignesDe(annexe).indexOf(tete) + 1]!;
    expect(suivante.cellules.reduce((n, c) => n + c.etendue, 0)).toBe(6);
    expect(htmlContrat(champs())).toContain('<td colspan="2" rowspan="3" class="categorie">I. - Assemblée générale</td>');
  });

  it("la fiche d'information 3.4 a ses trois colonnes, dont « Au temps passé »", () => {
    const fiche = tous.find((t) => lignesDe(t)[0]?.cellules.some((c) => c.texte === "Au temps passé"))!;
    expect(lignesDe(fiche)[0]!.cellules.map((c) => [c.texte, c.etendue])).toEqual([["", 4], ["Au temps passé", 2], ["Tarif forfaitaire total proposé", 2]]);
  });

  it("imprime les deux parties signataires cote a cote", () => {
    const sig = a.gauche.find((n) => n.type === "signatures");
    expect(sig).toEqual({ type: "signatures", parties: ["Le syndicat", "Le syndic"] });
    expect(tous.some((t) => lignesDe(t).some((l) => l.cellules[0]?.texte === "Le syndicat"))).toBe(false);
    expect(htmlContrat(champs())).toContain('<div class="signatures"><div>Le syndicat</div><div>Le syndic</div></div>');
  });

  it("numerote les sections en titres", () => {
    expect(titres(a.gauche)).toContain("7.1.5. Modalités de rémunération");
    expect(titres(a.gauche).some((t) => t.startsWith("7.1.3. Prestations optionnelles"))).toBe(true);
  });

  it("ajoute les conditions particulieres en fin de colonne droite, seulement si renseignees", () => {
    expect(titres(a.droite)).not.toContain("CONDITIONS PARTICULIÈRES");
    const b = arbreContrat(champs("Première année à -10 %."));
    const fin = b.droite.slice(-2);
    expect(fin[0]).toEqual({ type: "titre", texte: "CONDITIONS PARTICULIÈRES" });
    expect(fin[1]).toEqual({ type: "paragraphe", texte: "Première année à -10 %." });
  });
});

describe("htmlContrat", () => {
  it("echappe ce qui vient de la fiche", () => {
    const html = htmlContrat(champs("<script>alert(1)</script> & co"));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; co");
  });
  it("porte la regle @page A4, des <thead> et le logo quand on le donne", () => {
    const html = htmlContrat(champs(), "data:image/png;base64,AAAA");
    expect(html).toContain("@page { size: A4;");
    expect(html).toContain("<thead>");
    expect(html).toContain('<img src="data:image/png;base64,AAAA"');
    expect(html).toContain("4 rue des Bleuets");
  });
});

describe("contrat de mandat (ASL / AFUL)", () => {
  const aful: CoproContrat = { ...COPRO, code: "S216", nom: "ILOTBLEUET", formeJuridique: "aful", denomination: "Îlot Lacroix Bleuets" };
  const c = champs(undefined, aful);
  const a = arbreContrat(c);

  it("sort sur une colonne, avec le titre du mandat et la forme en capitales", () => {
    expect(a.droite).toEqual([]);
    expect(a.enTete).toEqual([]);
    expect(a.titre).toBe("CONTRAT DE MANDAT DU GESTIONNAIRE PROFESSIONNEL\nD’UNE AFUL N°");
    const textes = a.gauche.flatMap((n) => (n.type === "paragraphe" || n.type === "titre" ? [n.texte] : []));
    expect(textes).toContain("Ci-après dénommé l’AFUL Îlot Lacroix Bleuets");
    expect(textes.some((t) => t.includes("prendra effet le 01/07/2026 et prendra fin le 30/06/2027"))).toBe(true);
  });

  it("resout TOUS les placeholders du gabarit du mandat", () => {
    const table = tableRemplacement(c);
    expect(PLACEHOLDERS_MANDAT.filter((p) => table[p] === undefined)).toEqual([]);
    const restants = a.gauche.flatMap((n) =>
      n.type === "tableau" ? n.lignes.flatMap((l) => l.cellules.flatMap((x) => placeholdersNonResolus(x.texte, table))) : n.type === "signatures" ? [] : placeholdersNonResolus(n.texte, table),
    );
    expect([...new Set(restants)]).toEqual([]);
  });

  it("les tableaux font 12 cases (7 + 5, ou 4 + 4 + 4), les signataires sont ceux du mandat", () => {
    const tableaux = a.gauche.filter((n) => n.type === "tableau");
    expect(tableaux.length).toBeGreaterThan(5);
    for (const t of tableaux) {
      expect(t.type === "tableau" && t.colonnes).toBe(12);
      expect(t.type === "tableau" && t.lignes[0]!.cellules.reduce((n, x) => n + x.etendue, 0)).toBe(12);
    }
    expect(a.gauche.at(-1)).toEqual({ type: "signatures", parties: ["Le représentant de l’AFUL", "Le gestionnaire de l’AFUL"] });
  });

  it("n'applique pas la correction du § 7.1.1 du contrat de syndic", () => {
    const textes = a.gauche.flatMap((n) => (n.type === "paragraphe" ? [n.texte] : []));
    expect(textes.some((t) => t.includes("sont inclus dans la rémunération forfaitaire"))).toBe(true);
    expect(textes.some((t) => t.includes("7.1.5"))).toBe(false);
  });

  it("un contrat de syndic ordinaire ne change pas", () => {
    const b = arbreContrat(champs());
    expect(b.droite.length).toBeGreaterThan(10);
    expect(b.titre).toContain("CONTRAT DE SYNDIC");
  });
});
