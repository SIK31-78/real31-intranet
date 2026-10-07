// Adapter `docx` : l'ODJ du CS **tel qu'il a ete rempli en ligne**, dessine de bout en bout.
//
// Pas de gabarit ici (contrairement a odj-cs-docx-renderer, qui remplit le modele du
// cabinet) : le document est construit depuis l'arbre de rendu, donc TOUT ce que le module
// en ligne permet arrive dans le fichier - paragraphes libres, notes ancrees sous une ligne,
// champs et titres reecrits, points reglementaires retenus, heure de fin.
//
// Mise en page calquee sur l'ecran (components/odj/document-odj) : en-tete de marque,
// encadre "reunion", sections numerotees en vert, pied de page aux mentions legales de
// l'agence. Les mentions passent dans le PIED DE PAGE Word (toutes les pages) plutot qu'une
// seule fois en fin de document : c'est leur papier a en-tete, et un ODJ fait deux a trois
// pages.

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertMillimetersToTwip,
} from "docx";
import type { ArbreOdj, NoeudOdj, SectionRendue } from "@/lib/domain/odj-rendu";
import type { OdjRempliDocxRenderer, OptionsRenduOdjRempli } from "@/lib/ports/odj-rempli-docx-renderer";

// Couleurs de la marque, les memes qu'a l'ecran (globals.css) : docx les veut sans "#".
const VERT = "1C4736"; // --color-green-700
const ENCRE = "20251F"; // --color-ink
const ENCRE_2 = "4C5347"; // --color-ink-2
const FOND = "F5F6F3"; // --color-surface-2

const POLICE = "Aptos";
/** Demi-points (l'unite de taille de docx) : 11 pt de corps, comme leur ODJ Word. */
const CORPS = 22;
const PETIT = 20;
const MINUSCULE = 12;

/** Blanc a completer a la main : la valeur n'a pas ete renseignee en ligne. L'ecran dessine
 *  un trait pointille au meme endroit ; en Word, des points de conduite. */
const BLANC = "..............................";

/** Les sauts de ligne SAISIS sont rendus : leur ODJ est redige en paragraphes, pas en champs
 *  (un seul TextRun avalerait les "\n" et collerait tout sur une ligne). */
function runs(texte: string, props: { bold?: boolean; size?: number; color?: string } = {}): TextRun[] {
  const lignes = texte.split(/\r?\n/);
  return lignes.map(
    (l, i) =>
      new TextRun({
        text: l,
        font: POLICE,
        size: props.size ?? CORPS,
        color: props.color ?? ENCRE,
        ...(props.bold ? { bold: true } : {}),
        ...(i > 0 ? { break: 1 } : {}),
      }),
  );
}

/** Une ligne "Libelle : valeur". En mode paragraphe, la valeur passe SOUS le libelle et
 *  legerement indentee (la coupe est decidee par le domaine, pas ici). */
function ligne(n: Extract<NoeudOdj, { type: "ligne" }>): Paragraph[] {
  const libelle = new TextRun({ text: `${n.libelle} : `, font: POLICE, size: CORPS, bold: true, color: ENCRE });
  if (!n.paragraphe) {
    const valeur = n.valeur
      ? runs(n.valeur)
      : [new TextRun({ text: BLANC, font: POLICE, size: CORPS, color: ENCRE_2 })];
    return [new Paragraph({ spacing: { after: 40 }, children: [libelle, ...valeur] })];
  }
  return [
    new Paragraph({ spacing: { after: 20 }, keepNext: true, children: [libelle] }),
    new Paragraph({ spacing: { after: 100 }, indent: { left: convertMillimetersToTwip(4) }, children: runs(n.valeur) }),
  ];
}

function paragrapheLibre(texte: string): Paragraph {
  return new Paragraph({ spacing: { after: 100 }, children: runs(texte) });
}

/** Un point reglementaire retenu : son intitule, puis son texte legal, en sobre. */
function point(n: Extract<NoeudOdj, { type: "point" }>): Paragraph[] {
  return [
    new Paragraph({ spacing: { after: 20 }, keepNext: true, children: runs(n.titre, { bold: true }) }),
    new Paragraph({ spacing: { after: 120 }, children: runs(n.texte, { size: PETIT, color: ENCRE_2 }) }),
  ];
}

function noeud(n: NoeudOdj): Paragraph[] {
  if (n.type === "ligne") return ligne(n);
  if (n.type === "paragraphe") return [paragrapheLibre(n.texte)];
  return point(n);
}

/** Titre de section : le numero et l'intitule en vert, souligne d'un filet, et jamais seul
 *  en bas de page (`keepNext`). */
function titreSection(s: SectionRendue): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 220, after: 100 },
    keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, space: 2, color: VERT } },
    children: [
      new TextRun({ text: `${s.numero}.  `, font: POLICE, size: 24, bold: true, color: VERT }),
      new TextRun({ text: s.titre.toUpperCase(), font: POLICE, size: 24, bold: true, color: VERT }),
    ],
  });
}

/** L'encadre "reunion" : un tableau d'une seule cellule, fond gris, comme a l'ecran. */
function encadreReunion(lignes: NoeudOdj[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: "DDE0DA" },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: "DDE0DA" },
      left: { style: BorderStyle.SINGLE, size: 2, color: "DDE0DA" },
      right: { style: BorderStyle.SINGLE, size: 2, color: "DDE0DA" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: FOND },
            margins: {
              top: convertMillimetersToTwip(2),
              bottom: convertMillimetersToTwip(2),
              left: convertMillimetersToTwip(3),
              right: convertMillimetersToTwip(3),
            },
            children: lignes.flatMap(noeud),
          }),
        ],
      }),
    ],
  });
}

/** L'en-tete de marque : le logo, le titre du document a droite, un filet vert dessous. */
function enTeteMarque(a: ArbreOdj, logo?: Buffer): Paragraph[] {
  const blocs: Paragraph[] = [];
  if (logo) {
    blocs.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          // Le logo fait 360 x 160 px ; 24 mm de haut au ratio d'origine, comme a l'ecran.
          new ImageRun({ data: logo, type: "png", transformation: { width: 150, height: 67 } }),
        ],
      }),
    );
  }
  blocs.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 60 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, space: 4, color: VERT } },
      children: [
        new TextRun({ text: a.titre, font: POLICE, size: 26, bold: true, color: ENCRE }),
        new TextRun({ text: a.sousTitre, font: POLICE, size: PETIT, color: ENCRE_2, break: 1 }),
      ],
    }),
  );
  return blocs;
}

/** Le pied de page Word : les mentions legales de l'AGENCE, puis le numero de page. */
function piedDePage(a: ArbreOdj): Footer {
  return new Footer({
    children: [
      ...a.mentions.map(
        (m) =>
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 0 },
            children: [new TextRun({ text: m, font: POLICE, size: MINUSCULE, color: ENCRE_2 })],
          }),
      ),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 40 },
        children: [
          new TextRun({ children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], font: POLICE, size: MINUSCULE, color: ENCRE_2 }),
        ],
      }),
    ],
  });
}

export class DocxOdjRempliRenderer implements OdjRempliDocxRenderer {
  async rendre(a: ArbreOdj, options: OptionsRenduOdjRempli = {}): Promise<Buffer> {
    const corps: (Paragraph | Table)[] = [
      ...enTeteMarque(a, options.logo),
      // Copropriete : son nom, son code, son adresse.
      new Paragraph({
        spacing: { before: 160, after: 0 },
        children: [
          new TextRun({ text: a.copro.nom, font: POLICE, size: 32, bold: true, color: ENCRE }),
          new TextRun({ text: `  (${a.copro.code})`, font: POLICE, size: 24, color: ENCRE_2 }),
        ],
      }),
      new Paragraph({ spacing: { after: 160 }, children: runs(a.copro.adresse, { size: PETIT, color: ENCRE_2 }) }),
      encadreReunion(a.reunion),
      // Word colle deux tableaux consecutifs : un paragraphe vide ferme l'encadre.
      new Paragraph({ spacing: { after: 0 }, children: [] }),
    ];

    for (const s of a.sections) {
      corps.push(titreSection(s));
      corps.push(...s.noeuds.flatMap(noeud));
    }

    for (const b of a.blocsFin) corps.push(paragrapheLibre(b));

    corps.push(
      new Paragraph({
        spacing: { before: 240, after: 0 },
        border: { top: { style: BorderStyle.SINGLE, size: 4, space: 6, color: "DDE0DA" } },
        children: [
          new TextRun({ text: "Fin de réunion : ", font: POLICE, size: CORPS, color: ENCRE }),
          new TextRun({
            text: a.finReunion || BLANC,
            font: POLICE,
            size: CORPS,
            color: a.finReunion ? ENCRE : ENCRE_2,
            ...(a.finReunion ? { bold: true } : {}),
          }),
        ],
      }),
    );

    const doc = new Document({
      creator: "REAL31 Intranet",
      title: `${a.titre} - ${a.copro.nom}`,
      description: a.sousTitre,
      styles: { default: { document: { run: { font: POLICE, size: CORPS, color: ENCRE } } } },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertMillimetersToTwip(15),
                bottom: convertMillimetersToTwip(15),
                left: convertMillimetersToTwip(15),
                right: convertMillimetersToTwip(15),
              },
            },
          },
          footers: { default: piedDePage(a) },
          children: corps,
        },
      ],
    });

    return Packer.toBuffer(doc);
  }
}
