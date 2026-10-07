// Test d'INTEGRATION : le .docx se construit vraiment, s'ouvre comme une archive OOXML, et
// porte bien tout ce que le gabarit du cabinet laissait tomber (paragraphes libres, notes,
// points retenus, heure de fin). On lit le document.xml : c'est la seule preuve que le texte
// est arrive dans le fichier, et non seulement dans l'arbre.

import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import type { ArbreOdj } from "@/lib/domain/odj-rendu";
import { DocxOdjRempliRenderer } from "./odj-rempli-docx-renderer";

const ARBRE: ArbreOdj = {
  titre: "Préparation d'assemblée générale",
  sousTitre: "Document issu du conseil syndical",
  copro: { code: "S146", nom: "Les Marronniers", adresse: "12 rue des Lilas, 92250 La Garenne-Colombes" },
  reunion: [
    { type: "ligne", libelle: "Conseil syndical du", valeur: "05/10/2026", paragraphe: false },
    { type: "ligne", libelle: "Lieu", valeur: "", paragraphe: false },
  ],
  sections: [
    {
      numero: 1,
      titre: "Vérification des comptes",
      noeuds: [
        { type: "ligne", libelle: "Budget", valeur: "45 000,00 €", paragraphe: false },
        { type: "paragraphe", texte: "Le trop-perçu sera rendu avec l'appel du T1." },
        { type: "ligne", libelle: "Régularisation eau", valeur: "Sur deux lignes\net la suite", paragraphe: true },
      ],
    },
    {
      numero: 2,
      titre: "Points réglementaires à l'ordre du jour",
      noeuds: [{ type: "point", titre: "Plan pluriannuel de travaux", texte: "Le PPT est soumis au vote." }],
    },
  ],
  blocsFin: ["Le CS valide l'ordre du jour proposé."],
  finReunion: "20h30",
  mentions: ["VENTE · LOCATION · GESTION", "SAS au capital de 90 000 €"],
};

/** Le texte du document.xml, balises retirees : ce que Word affichera. */
async function texteDu(docx: Buffer): Promise<string> {
  const zip = new PizZip(docx);
  const xml = zip.file("word/document.xml")?.asText() ?? "";
  // Les sauts de ligne OOXML (<w:br/>) deviennent des espaces : on ne teste pas la mise en
  // page ici, seulement la PRESENCE du texte. Les entites XML sont redecodees (docx echappe
  // les apostrophes en &apos;, on veut comparer au texte tel qu'il sera lu dans Word).
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("DocxOdjRempliRenderer", () => {
  it("produit une archive OOXML que Word sait ouvrir", async () => {
    const docx = await new DocxOdjRempliRenderer().rendre(ARBRE);
    const zip = new PizZip(docx);
    expect(Object.keys(zip.files)).toContain("word/document.xml");
    expect(Object.keys(zip.files)).toContain("[Content_Types].xml");
    // Un pied de page est declare : c'est la qu'on met les mentions legales.
    expect(Object.keys(zip.files).some((n) => /^word\/footer\d*\.xml$/.test(n))).toBe(true);
    // Word refuse une archive qui contient des ENTREES DE DOSSIER ("word/", "docProps/") :
    // c'est ce qui cassait le gabarit le 22/09/2026 (cf. odj-cs-docx-renderer).
    expect(Object.values(zip.files).filter((f) => f.dir)).toEqual([]);
  });

  it("ecrit la copropriete, l'encadre reunion et les sections numerotees", async () => {
    const texte = await texteDu(await new DocxOdjRempliRenderer().rendre(ARBRE));
    expect(texte).toContain("Les Marronniers");
    expect(texte).toContain("S146");
    expect(texte).toContain("12 rue des Lilas");
    expect(texte).toContain("Conseil syndical du");
    expect(texte).toContain("05/10/2026");
    expect(texte).toContain("VÉRIFICATION DES COMPTES");
    expect(texte).toContain("45 000,00 €");
  });

  it("emporte CE QUE LE GABARIT PERDAIT : paragraphes libres, points retenus, fin de reunion", async () => {
    const texte = await texteDu(await new DocxOdjRempliRenderer().rendre(ARBRE));
    expect(texte).toContain("Le trop-perçu sera rendu avec l'appel du T1.");
    expect(texte).toContain("Régularisation eau");
    expect(texte).toContain("Sur deux lignes");
    expect(texte).toContain("et la suite");
    expect(texte).toContain("Plan pluriannuel de travaux");
    expect(texte).toContain("Le PPT est soumis au vote.");
    expect(texte).toContain("Le CS valide l'ordre du jour proposé.");
    expect(texte).toContain("Fin de réunion");
    expect(texte).toContain("20h30");
  });

  it("laisse un blanc a completer quand la valeur n'a pas ete saisie, jamais 'undefined'", async () => {
    const texte = await texteDu(await new DocxOdjRempliRenderer().rendre(ARBRE));
    expect(texte).toContain("Lieu");
    expect(texte).toContain("....");
    expect(texte).not.toContain("undefined");
  });

  it("met les mentions legales de l'agence dans le pied de page", async () => {
    const docx = await new DocxOdjRempliRenderer().rendre(ARBRE);
    const zip = new PizZip(docx);
    const pied = Object.keys(zip.files).find((n) => /^word\/footer\d*\.xml$/.test(n))!;
    const xml = zip.file(pied)?.asText() ?? "";
    expect(xml).toContain("SAS au capital de 90 000");
  });

  it("embarque le logo quand il est fourni, et se rend quand meme sans lui", async () => {
    // Un PNG 1x1 valide : on verifie le chemin d'embarquement, pas l'image.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
      "base64",
    );
    const avec = new PizZip(await new DocxOdjRempliRenderer().rendre(ARBRE, { logo: png }));
    expect(Object.keys(avec.files).some((n) => n.startsWith("word/media/"))).toBe(true);
    const sans = new PizZip(await new DocxOdjRempliRenderer().rendre(ARBRE));
    expect(Object.keys(sans.files).some((n) => n.startsWith("word/media/"))).toBe(false);
  });
});
