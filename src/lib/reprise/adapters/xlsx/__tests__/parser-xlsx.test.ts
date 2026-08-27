// Tests du parseur des xlsx d'entree (miroir de generer-xlsx).
//
// La propriete REINE est l'ALLER-RETOUR : ce que genererPhaseABuffers ecrit, le parseur doit
// le relire et reconstituer le MEME jeu (aux pertes assumees pres : ids d'owners regeneres par
// ordre de ligne, libelles de cles slugifies, pays "France" par defaut). Les autres cas
// couvrent les fichiers casses : colonnes manquantes, valeurs illisibles, doublons, phase B.

import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";
import { genererPhaseABuffers } from "../generer-xlsx";
import { parserJeuDepuisXlsx, typeFichierEntree, type FichierEntree } from "../parser-xlsx";
import { FEUILLES, HEADERS_LOTS, HEADERS_TANTIEMES } from "../colonnes-estale";

/** Jeu riche et coherent : 3 lots, 2 cles, 3 owners (dont 1 SCI et 1 couple), 3 attributions. */
function jeuComplet(): JeuDeDonnees {
  return {
    lots: [
      { numero: 1, type: "Appartement", usage: "residential", escalier: "A", etage: 2, porte: "G", surface: 62.5, nbPiece: 3, commentaire: "Un appartement au 2e" },
      { numero: 2, type: "Parking", usage: "parking", etage: -1, commentaire: "Emplacement sous-sol" },
      { numero: 3, type: "Cave", usage: "other", commentaire: "Cave" },
    ],
    cles: [
      { code: "001", libelle: "Charges generales", totalAttendu: 1000, defaut: true },
      { code: "100", libelle: "Batiment A", totalAttendu: 600 },
    ],
    tantiemes: [
      { cleCode: "001", lot: 1, valeur: 500 },
      { cleCode: "001", lot: 2, valeur: 300 },
      { cleCode: "001", lot: 3, valeur: 200 },
      { cleCode: "100", lot: 1, valeur: 600 },
    ],
    owners: [
      { id: "a", civilite: "m", nom: "DUPONT", prenom: "Jean", pro: false, naissance: "01/02/1970", email: "jean@exemple.fr", occupant: true, adrNum: "12", adrVoie: "rue des Lilas", adrCodePostal: "31000", adrVille: "Toulouse", paysAdresse: "France" },
      { id: "b", civilite: "m", nom: "SCI DES ROSES", pro: true, formeJuridique: "SCI", raisonSociale: "SCI DES ROSES", siren: "123456789", capital: 1000, occupant: null },
      { id: "c", civilite: "m&mme", nom: "MARTIN", prenom: "Paul & Marie", pro: false, occupant: false },
    ],
    attributions: [
      { ownerId: "a", lot: 1 },
      { ownerId: "b", lot: 2 },
      { ownerId: "c", lot: 3 },
    ],
  };
}

/** Buffers generes -> FichierEntree (on ecarte le links_DRAFT ou pas selon le cas de test). */
async function genererFichiers(jeu: JeuDeDonnees): Promise<FichierEntree[]> {
  const buffers = await genererPhaseABuffers(jeu);
  return buffers.map((b) => ({ nom: b.nom, contenu: b.contenu }));
}

/** Construit un petit xlsx en memoire (feuille + en-tetes + lignes). */
async function xlsx(feuille: string, headers: readonly string[], lignes: (string | number | null)[][]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(feuille);
  ws.addRow([...headers]);
  for (const l of lignes) ws.addRow(l);
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

describe("typeFichierEntree (aiguillage par nom)", () => {
  it("reconnait les 4 familles + les noms des templates", () => {
    expect(typeFichierEntree("lots.xlsx")).toBe("lots");
    expect(typeFichierEntree("lots - template.xlsx")).toBe("lots");
    expect(typeFichierEntree("tantiemes_001_charges-generales.xlsx")).toBe("tantiemes");
    expect(typeFichierEntree("tant_100_batiment-a.xlsx")).toBe("tantiemes");
    expect(typeFichierEntree("dkl.xlsx")).toBe("tantiemes");
    expect(typeFichierEntree("owners.xlsx")).toBe("owners");
    expect(typeFichierEntree("Copropriétaires S0303.xlsx")).toBe("owners");
    expect(typeFichierEntree("links.xlsx")).toBe("links");
    expect(typeFichierEntree("links_DRAFT.xlsx")).toBe("links");
  });

  it("ne devine pas : nom inconnu ou extension non xlsx -> inconnu", () => {
    expect(typeFichierEntree("grand-livre-2025.pdf")).toBe("inconnu");
    expect(typeFichierEntree("entries.xlsx")).toBe("inconnu");
    expect(typeFichierEntree("budget.xlsx")).toBe("inconnu");
  });
});

describe("aller-retour generer -> parser (la propriete miroir)", () => {
  it("reconstitue le jeu complet depuis les buffers generes", async () => {
    const jeu = jeuComplet();
    const res = await parserJeuDepuisXlsx(await genererFichiers(jeu));

    expect(res.erreurs).toEqual([]);
    expect(res.ok).toBe(true);

    // LOTS : identiques champ a champ.
    expect(res.jeu.lots).toEqual(jeu.lots);

    // CLES : codes + totaux identiques (libelle slugifie = perte assumee, defaut sur 001).
    expect(res.jeu.cles.map((c) => ({ code: c.code, totalAttendu: c.totalAttendu, defaut: c.defaut ?? false }))).toEqual(
      jeu.cles.map((c) => ({ code: c.code, totalAttendu: c.totalAttendu, defaut: c.defaut ?? false })),
    );

    // TANTIEMES : memes triplets (ordre par fichier de cle).
    const triplets = (t: { cleCode: string; lot: number; valeur: number }[]) =>
      [...t].sort((x, y) => x.cleCode.localeCompare(y.cleCode) || x.lot - y.lot).map((x) => `${x.cleCode}/${x.lot}/${x.valeur}`);
    expect(triplets(res.jeu.tantiemes)).toEqual(triplets(jeu.tantiemes));

    // OWNERS : memes donnees, ids regeneres par ordre de ligne (o1, o2, o3) et pays par defaut.
    expect(res.jeu.owners.map((o) => o.id)).toEqual(["o1", "o2", "o3"]);
    expect(res.jeu.owners.map((o) => ({ nom: o.nom, prenom: o.prenom, civilite: o.civilite, pro: o.pro, siren: o.siren, capital: o.capital, occupant: o.occupant ?? null }))).toEqual(
      jeu.owners.map((o) => ({ nom: o.nom, prenom: o.prenom, civilite: o.civilite, pro: o.pro, siren: o.siren, capital: o.capital, occupant: o.occupant ?? null })),
    );

    // ATTRIBUTIONS : memes liens owner <-> lot, via la correspondance d'index (a->o1, b->o2, c->o3).
    expect(res.jeu.attributions).toEqual([
      { ownerId: "o1", lot: 1 },
      { ownerId: "o2", lot: 2 },
      { ownerId: "o3", lot: 3 },
    ]);
  });
});

describe("fichiers casses (erreurs structurelles, jamais silencieuses)", () => {
  it("colonnes manquantes -> erreur qui nomme la colonne et le fichier", async () => {
    const contenu = await xlsx(FEUILLES.lots, ["N° Lot", "Type"], [[1, "Appartement"]]);
    const res = await parserJeuDepuisXlsx([{ nom: "lots.xlsx", contenu }]);
    expect(res.ok).toBe(false);
    expect(res.erreurs.some((e) => e.includes("lots.xlsx") && e.includes('"Usage"'))).toBe(true);
    // Le fichier casse ne verse RIEN dans le jeu.
    expect(res.jeu.lots).toEqual([]);
  });

  it("valeur illisible (N° Lot texte, etage non numerique) -> erreurs par ligne", async () => {
    const contenu = await xlsx(FEUILLES.lots, HEADERS_LOTS, [
      ["abc", "Appartement", "residential", "", "", "", "", "", "Commentaire"],
      [2, "Appartement", "residential", "", "RDC", "", "", "", "Commentaire"],
    ]);
    const res = await parserJeuDepuisXlsx([{ nom: "lots.xlsx", contenu }]);
    expect(res.ok).toBe(false);
    expect(res.erreurs.some((e) => e.includes("ligne 2") && e.includes("N° Lot"))).toBe(true);
    expect(res.erreurs.some((e) => e.includes("ligne 3") && e.includes("Étage"))).toBe(true);
  });

  it("fichier tantiemes sans code de cle dans le nom -> refus actionnable (jamais de cle devinee)", async () => {
    const contenu = await xlsx(FEUILLES.tantiemes, HEADERS_TANTIEMES, [[1, 500]]);
    const res = await parserJeuDepuisXlsx([{ nom: "dkl.xlsx", contenu }]);
    expect(res.ok).toBe(false);
    expect(res.erreurs.some((e) => e.includes("code de cle indeterminable"))).toBe(true);
  });

  it("deux fichiers tantiemes pour la meme cle -> doublon refuse", async () => {
    const contenu = await xlsx(FEUILLES.tantiemes, HEADERS_TANTIEMES, [[1, 500]]);
    const res = await parserJeuDepuisXlsx([
      { nom: "tantiemes_001_a.xlsx", contenu },
      { nom: "tantiemes_001_b.xlsx", contenu },
    ]);
    expect(res.ok).toBe(false);
    expect(res.erreurs.some((e) => e.includes("doublon de cle"))).toBe(true);
    // La premiere cle versee reste ; la seconde est refusee.
    expect(res.jeu.cles).toHaveLength(1);
  });

  it("fichier illisible (pas un xlsx) -> erreur explicite", async () => {
    const res = await parserJeuDepuisXlsx([{ nom: "lots.xlsx", contenu: new Uint8Array([1, 2, 3]) }]);
    expect(res.ok).toBe(false);
    expect(res.erreurs.some((e) => e.includes("illisible"))).toBe(true);
  });
});

describe("links : resolution des noms vers les owners", () => {
  const owners = async () => {
    const jeu = jeuComplet();
    const fichiers = await genererFichiers(jeu);
    return fichiers.filter((f) => typeFichierEntree(f.nom) === "owners");
  };

  it("un nom ambigu (homonymes) -> erreur, jamais de rattachement au hasard", async () => {
    // Deux DUPONT distincts (prenoms differents) : "DUPONT" seul devient ambigu.
    const jeu = jeuComplet();
    jeu.owners.push({ id: "d", civilite: "mme", nom: "DUPONT", prenom: "Anne", pro: false, occupant: null });
    jeu.attributions = [{ ownerId: "a", lot: 1 }, { ownerId: "d", lot: 2 }, { ownerId: "c", lot: 3 }];
    const fichiers = await genererFichiers(jeu);
    const ownersF = fichiers.filter((f) => typeFichierEntree(f.nom) === "owners");
    const links = await xlsx(FEUILLES.links, ["N° Copropriétaire", "N° Lot"], [["DUPONT", 1]]);
    const res = await parserJeuDepuisXlsx([...ownersF, { nom: "links.xlsx", contenu: links }]);
    expect(res.ok).toBe(false);
    expect(res.erreurs.some((e) => e.includes("ambigu"))).toBe(true);
  });

  it("un code eStale 4 caracteres (fichier phase B) -> refus qui explique quoi verser", async () => {
    const links = await xlsx(FEUILLES.links, ["N° Copropriétaire", "N° Lot"], [["000A", 1]]);
    const res = await parserJeuDepuisXlsx([...(await owners()), { nom: "links.xlsx", contenu: links }]);
    expect(res.ok).toBe(false);
    expect(res.erreurs.some((e) => e.includes("phase B") && e.includes("links_DRAFT"))).toBe(true);
  });

  it("un nom introuvable -> erreur nominative", async () => {
    const links = await xlsx(FEUILLES.links, ["N° Copropriétaire", "N° Lot"], [["INCONNU Jean", 1]]);
    const res = await parserJeuDepuisXlsx([...(await owners()), { nom: "links.xlsx", contenu: links }]);
    expect(res.ok).toBe(false);
    expect(res.erreurs.some((e) => e.includes("introuvable"))).toBe(true);
  });

  it("links sans owners dans le lot -> refus (les noms ne peuvent pas se resoudre)", async () => {
    const links = await xlsx(FEUILLES.links, ["N° Copropriétaire", "N° Lot"], [["DUPONT Jean", 1]]);
    const res = await parserJeuDepuisXlsx([{ nom: "links.xlsx", contenu: links }]);
    expect(res.ok).toBe(false);
    expect(res.erreurs.some((e) => e.includes("owners.xlsx"))).toBe(true);
  });
});

describe("doublons de donnees : le parseur laisse passer, les auto-checks jugent", () => {
  it("deux lots au meme numero traversent le parseur (LOT_NUMERO_DOUBLON les attrapera)", async () => {
    const contenu = await xlsx(FEUILLES.lots, HEADERS_LOTS, [
      [1, "Appartement", "residential", "", "", "", "", "", "x"],
      [1, "Appartement", "residential", "", "", "", "", "", "y"],
    ]);
    const res = await parserJeuDepuisXlsx([{ nom: "lots.xlsx", contenu }]);
    expect(res.erreurs).toEqual([]);
    expect(res.jeu.lots).toHaveLength(2);
  });

  it("fichier non reconnu -> note de vigilance, jamais un silence", async () => {
    const res = await parserJeuDepuisXlsx([{ nom: "budget.xlsx", contenu: new Uint8Array([0]) }]);
    expect(res.notes.some((n) => n.includes("budget.xlsx") && n.includes("non reconnu"))).toBe(true);
  });
});
