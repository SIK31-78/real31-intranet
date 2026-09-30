// L'arbre de rendu du contrat : ce que l'ecran et le PDF dessinent. Retour du test du
// 17/09/2026 : « le pdf est mal genere notamment au niveau des tableaux ».

import { describe, expect, it } from "vitest";
import { assemblerChampsContrat, PRESTATIONS_CONTRAT, PRESTATIONS_MANDAT, type CoproContrat, type PrestationContrat } from "./champs-contrat";
import { htmlContrat } from "./html-contrat";
import { arbreContrat, estMontant, estTitre, grilleAlignee, rangeesVisAVis, recollerPhrasesCoupees, type NoeudContrat } from "./rendu-contrat";
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
    expect(sig).toMatchObject({ type: "signatures", parties: ["Le syndicat", "Le syndic"] });
    expect(tous.some((t) => lignesDe(t).some((l) => l.cellules[0]?.texte === "Le syndicat"))).toBe(false);
    expect(htmlContrat(champs())).toContain('<div class="signatures"><div>Le syndicat</div><div>Le syndic</div></div>');
  });

  it("numerote les sections en titres", () => {
    expect(titres(a.gauche)).toContain("7.1.5. Modalités de rémunération");
    expect(titres(a.gauche).some((t) => t.startsWith("7.1.3. Prestations optionnelles"))).toBe(true);
  });

  it("place les deux colonnes en vis-a-vis, rangee par rangee du classeur", () => {
    const g = grilleAlignee(a);
    // « 4. RESILIATION... » (gauche, ligne 38 du classeur) est en face du bloc de droite qui
    // commence a la meme ligne. Depuis le recollement des phrases coupees (30/09/2026), ce
    // bloc commence a « En l'absence de transmission... » : sa premiere phrase a rejoint la
    // colonne de gauche, ou la phrase commence.
    const quatre = g.gauche.find((p) => p.noeud.type === "titre" && p.noeud.texte.startsWith("4. RESILIATION"))!;
    const enFace = g.droite.find((p) => p.noeud.type === "paragraphe" && /^En l.absence de transmission/.test(p.noeud.texte))!;
    expect(enFace).toBeDefined();
    expect(quatre.rangee).toBe(enFace.rangee);
    // Chaque colonne avance sans chevauchement, et couvre au moins une rangee par bloc.
    for (const col of [g.gauche, g.droite]) {
      for (let i = 1; i < col.length; i++) expect(col[i]!.rangee).toBeGreaterThanOrEqual(col[i - 1]!.rangee + col[i - 1]!.etendue);
      for (const p of col) expect(p.etendue).toBeGreaterThanOrEqual(1);
    }
    expect(g.rangees).toBeGreaterThan(80);
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

  it("porte la carte professionnelle du contrat de syndic, sans sa date ni le montant de la garantie", () => {
    const textes = a.gauche.flatMap((n) => (n.type === "paragraphe" ? [n.texte] : []));
    const carte = textes.find((t) => t.startsWith("Titulaire de la carte professionnelle"))!;
    expect(carte).toContain("délivrée par la CCI Paris Île-de-France. Garanti par GALIAN-SMABTP");
    expect(carte).toContain("contrat souscrit le 13/12/2004");
    expect(carte).not.toContain("Novembre");
    expect(carte).not.toContain("10 106 000");
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

describe("rangeesVisAVis", () => {
  it("ne perd aucun bloc et garde l'ordre de chaque colonne", () => {
    const a = arbreContrat(champs());
    const rangees = rangeesVisAVis(a);
    expect(rangees.flatMap((r) => r.gauche)).toEqual(a.gauche);
    expect(rangees.flatMap((r) => r.droite)).toEqual(a.droite);
  });

  it("coupe partout ou aucun bloc n'est a cheval : plus de rangee fourre-tout", () => {
    const a = arbreContrat(champs());
    // Une seule rangee voudrait dire que tout le contrat tient dans une cellule de tableau,
    // qui ne se couperait plus entre deux pages : c'est le bug qu'on corrige.
    expect(rangeesVisAVis(a).length).toBeGreaterThan(10);
  });

  it("garde dans la meme rangee les blocs qui commencent a la meme ligne du classeur", () => {
    const a = arbreContrat(champs());
    const rangees = rangeesVisAVis(a);
    const rangeeDu = (n: NoeudContrat) => rangees.findIndex((r) => r.gauche.includes(n) || r.droite.includes(n));
    // C'est tout l'interet du vis-a-vis : la prestation a gauche et son tarif a droite,
    // ecrits sur la meme ligne Excel, ne doivent jamais se retrouver a deux hauteurs.
    let verifiees = 0;
    for (const gauche of a.gauche) {
      if (gauche.de === undefined) continue;
      for (const droite of a.droite) {
        if (droite.de !== gauche.de) continue;
        expect(rangeeDu(gauche)).toBe(rangeeDu(droite));
        verifiees++;
      }
    }
    expect(verifiees).toBeGreaterThan(0);
  });
});

// Le classeur MYTHEC coupe deux phrases au bas de la colonne de gauche et en recopie la fin
// en haut de celle de droite. Les deux colonnes n'etant qu'approximativement synchronisees,
// la fin pouvait s'imprimer une page AVANT le debut (S111, 30/09/2026 : signature refusee en
// AG, le president ne trouvait pas la fin du 7.1.5).
describe("recollerPhrasesCoupees", () => {
  const a = arbreContrat(champs());
  // Le classeur melange ' et ’ d'un bloc a l'autre : on compare sans s'en soucier.
  const sansApostrophe = (t: string) => t.replace(/[’‘`]/g, "'");
  const paras = (n: NoeudContrat[]) =>
    n.filter((x) => x.type === "paragraphe").map((x) => sansApostrophe((x as { texte: string }).texte));

  it("le 6.2 porte sa phrase entiere, ponctuation comprise", () => {
    const bloc = paras(a.gauche).find((t) => t.includes("le conseil syndical peut prendre connaissance et copie"))!;
    expect(bloc).toContain("à sa demande, après en avoir donné avis au syndic");
    expect(bloc.trimEnd()).toMatch(/\.$/);
  });

  it("le 7.1.5 porte sa phrase entiere : elle ne s'arrete plus sur « précisées à »", () => {
    const bloc = paras(a.gauche).find((t) => t.includes("en cours d'exécution du présent contrat et dans les conditions précisées"))!;
    expect(bloc).toBeDefined();
    expect(bloc).toContain("dans les conditions précisées à l'article 18 de la loi du 10 juillet 1965");
    expect(bloc.trimEnd()).not.toMatch(/à$/);
  });

  it("la colonne de droite garde le reste du bloc, sans le repeter", () => {
    const droite = paras(a.droite);
    // La phrase recollee ne demarre plus un bloc de droite...
    expect(droite.some((t) => t.startsWith("après en avoir donné avis"))).toBe(false);
    expect(droite.some((t) => t.startsWith("l'article 18 de la loi du 10 juillet 1965, décidé de confier"))).toBe(false);
    // ...mais la suite du bloc, elle, reste a sa place.
    expect(droite.some((t) => t.startsWith("En l'absence de transmission"))).toBe(true);
    expect(droite.some((t) => t.startsWith("Dans l'hypothèse où l'assemblée générale"))).toBe(true);
  });

  it("aucun paragraphe du contrat ne se termine en plein milieu d'une phrase", () => {
    const pendantes = [...paras(a.gauche), ...paras(a.droite)]
      .map((t) => t.trim())
      .filter((t) => t.length > 60 && /\s(à|de|du|des|le|la|les|et|ou|par|pour|dans|sur|au|aux)$/.test(t));
    expect(pendantes).toEqual([]);
  });
});

// Le contrat se lit page par page, colonne gauche puis colonne droite. Nos hauteurs de bloc
// n'etant pas celles du Word de MYTHEC, le § 4 debordait en bas de la page 1 — donc AVANT
// les §§ 1 a 3 de la colonne de droite (Lea, 21/09/2026). On rouvre la page la ou MYTHEC
// l'ouvre, aux six bornes relevees sur le contrat S080 parti en convocation.
describe("debuts de page", () => {
  const rangees = rangeesVisAVis(arbreContrat(champs()));
  const ouvrantes = rangees.filter((r) => r.nouvellePage);

  it("ouvre une page aux six bornes du contrat MYTHEC, pas ailleurs", () => {
    expect(ouvrantes).toHaveLength(6);
    expect(ouvrantes.map((r) => r.gauche[0]?.de ?? r.droite[0]?.de)).toEqual([38, 86, 133, 226, 367, 414]);
  });

  it("le § 4 ouvre une page : il ne peut plus passer avant les §§ 1 a 3 d'en face", () => {
    const quatre = ouvrantes.find((r) => r.gauche[0]?.type === "titre" && r.gauche[0].texte.startsWith("4. RESILIATION"));
    expect(quatre).toBeDefined();
  });

  it("une rangee a colonne vide n'ouvre pas de page par accident", () => {
    // Le piege : `rangee.gauche[0]` vaut undefined quand la colonne est vide. Compare a un
    // index hors bornes, undefined === undefined marquait 14 rangees au lieu de 6.
    for (const r of rangees) {
      if (!r.gauche.length && !r.droite.length) expect(r.nouvellePage).toBeFalsy();
    }
  });
});
