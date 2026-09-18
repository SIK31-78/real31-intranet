// Convertit le gabarit Excel du contrat de syndic en module TypeScript versionne.
//
// POURQUOI UN SCRIPT ET PAS UNE LECTURE AU RUNTIME : le contrat type change quand la loi
// change (le gabarit cite deja les decrets de 2015, 2020 et 2025). On veut donc pouvoir
// le REGENERER, mais pas dependre d'un classeur Excel a chaque impression - le document
// doit sortir meme si personne ne retrouve le fichier SharePoint.
//
// Le classeur vient du site SharePoint « Reality », bibliotheque Documents, fichier
// « Contrat de Syndic.xlsx » (cf. docs/REAL31_Guide_Admin.pdf, section 5).
//
// SA MISE EN PAGE : DEUX COLONNES cote a cote, comme sur le contrat imprime (verifie sur
// data/5 Contrat de Syndic-S234-*.pdf). La colonne de gauche occupe les cases A a H,
// celle de droite les cases J a Q, la case I servant de gouttiere. Chaque colonne fait
// HUIT cases de meme largeur : c'est l'unite de toutes les largeurs de tableau (une grille
// tarifaire = 4 + 4, une annexe = 2 + 2 + 4). Chaque colonne est un FLUX INDEPENDANT :
// « ENTRE LES SOUSSIGNES PARTIES » a gauche fait face a « PREAMBULE » a droite.
//
// LES FUSIONS FONT LA STRUCTURE (reecriture du 18/09/2026). Une cellule fusionnee sur les
// huit cases est un paragraphe ; sinon la ligne est une ligne de tableau, chaque cellule
// avec sa largeur en cases et, quand la fusion descend sur plusieurs lignes, sa hauteur en
// lignes de tableau (la categorie « I. - Assemblée générale » de l'annexe). Les cases vides
// non couvertes sont gardees comme cellules vides : elles tiennent la place (la case
// au-dessus de la categorie dans l'en-tete « PRESTATIONS | DÉTAILS »). Avant, le script
// devinait tout ca a partir des textes et perdait les cases vides et les largeurs.
//
// Usage : node scripts/convertir-gabarit-contrat.mjs "docs/Contrat de Syndic.xlsx"
// Sortie : src/lib/domain/contrat/gabarit-contrat.ts

import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";

const SOURCE = process.argv[2] ?? "docs/Contrat de Syndic.xlsx";
const SORTIE = process.argv[3] ?? "src/lib/domain/contrat/gabarit-contrat.ts";

/** Les deux colonnes du document, en numeros de case Excel (1 = A). */
const MOITIES = [
  { nom: "gauche", de: 1, a: 8 },
  { nom: "droite", de: 10, a: 17 },
];
const LARGEUR = 8;

function texteDe(cell) {
  let v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) v = v.richText.map((t) => t.text).join("");
    else if (v.result !== undefined) v = v.result;
    else if (v.text !== undefined) v = v.text;
    else return "";
  }
  return String(v).replace(/\r\n/g, "\n").trim();
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SOURCE);
const ws = wb.worksheets[0];

// --- Les fusions : « A100:H104 » -> { r1, c1, r2, c2 }, indexees par case de depart et par case couverte.
function coord(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]), c };
}
const fusions = (ws.model.merges ?? []).map((plage) => {
  const [d, f] = plage.split(":").map(coord);
  return { r1: d.r, c1: d.c, r2: f.r, c2: f.c };
});
const departs = new Map(fusions.map((f) => [`${f.r1},${f.c1}`, f]));
const couvertes = new Map();
for (const f of fusions)
  for (let r = f.r1; r <= f.r2; r++)
    for (let c = f.c1; c <= f.c2; c++) if (r !== f.r1 || c !== f.c1) couvertes.set(`${r},${c}`, f);

const texteEn = (r, c) => texteDe(ws.getRow(r).getCell(c));

// --- Une ligne Excel « compte » pour une moitie si une cellule y COMMENCE avec du texte.
// C'est l'unite des hauteurs de fusion : une categorie fusionnee sur 12 lignes Excel qui
// n'en contiennent que 3 de tableau a une hauteur de 3.
function lignesUtiles(moitie) {
  const utiles = new Set();
  for (let r = 1; r <= ws.rowCount; r++) {
    for (let c = moitie.de; c <= moitie.a; c++) {
      if (couvertes.has(`${r},${c}`)) continue;
      if (texteEn(r, c)) {
        utiles.add(r);
        break;
      }
    }
  }
  return utiles;
}

/** Les cellules d'une moitie sur une ligne Excel : celles qui commencent ici, les vides gardees, les couvertes omises. */
function cellulesDe(r, moitie, utiles) {
  const cellules = [];
  let videDepuis = null;
  const fermerVide = (jusqua) => {
    if (videDepuis !== null) cellules.push({ texte: "", largeur: jusqua - videDepuis + 1, couverte: false });
    videDepuis = null;
  };
  let c = moitie.de;
  let couvertesIci = 0;
  while (c <= moitie.a) {
    const cle = `${r},${c}`;
    if (couvertes.has(cle)) {
      fermerVide(c - 1);
      couvertesIci++;
      c++;
      continue;
    }
    const f = departs.get(cle);
    const fin = f ? Math.min(f.c2, moitie.a) : c;
    const texte = texteEn(r, c);
    if (!texte) {
      if (videDepuis === null) videDepuis = c;
      c = fin + 1;
      continue;
    }
    fermerVide(c - 1);
    let hauteur = 1;
    if (f && f.r2 > f.r1) {
      hauteur = 0;
      for (let rr = f.r1; rr <= f.r2; rr++) if (utiles.has(rr)) hauteur++;
      hauteur = Math.max(1, hauteur);
    }
    cellules.push({ texte, largeur: fin - c + 1, hauteur, couverte: false });
    c = fin + 1;
  }
  fermerVide(moitie.a);
  return { cellules, couvertesIci };
}

const pleineLargeur = [];
const flux = { gauche: [], droite: [] };
const utilesPar = Object.fromEntries(MOITIES.map((m) => [m.nom, lignesUtiles(m)]));

for (let r = 1; r <= ws.rowCount; r++) {
  // PLEINE LARGEUR : une fusion de A jusqu'a la colonne de droite (le titre, la mention des
  // decrets). Sans ce cas, elle serait imprimee DEUX FOIS, une par colonne.
  const f = departs.get(`${r},1`);
  if (f && f.c2 >= MOITIES[1].de) {
    const t = texteEn(r, 1);
    if (t) pleineLargeur.push(t);
    continue;
  }
  for (const moitie of MOITIES) {
    const utiles = utilesPar[moitie.nom];
    if (!utiles.has(r)) continue;
    const { cellules, couvertesIci } = cellulesDe(r, moitie, utiles);
    const pleines = cellules.filter((x) => x.texte);
    // Un seul texte sur les huit cases, rien de couvert : un paragraphe.
    if (pleines.length === 1 && pleines[0].largeur === LARGEUR && couvertesIci === 0) {
      flux[moitie.nom].push(pleines[0].texte);
      continue;
    }
    flux[moitie.nom].push(
      cellules.map(({ texte, largeur, hauteur }) => ({ texte, largeur, ...(hauteur && hauteur > 1 ? { hauteur } : {}) })),
    );
  }
}

const placeholders = new Set();
for (const b of [...pleineLargeur, ...flux.gauche, ...flux.droite])
  for (const texte of typeof b === "string" ? [b] : b.map((c) => c.texte))
    for (const m of texte.matchAll(/\[[^\]\n]+\]/g)) placeholders.add(m[0]);

const liste = (blocs) => blocs.map((b) => "  " + JSON.stringify(b) + ",").join("\n");
const nbLignes = (blocs) => blocs.filter((b) => typeof b !== "string").length;

const contenu = `// Gabarit du contrat de syndic REAL31 - GENERE, NE PAS EDITER A LA MAIN.
//
// Produit par \`node scripts/convertir-gabarit-contrat.mjs\` a partir du classeur
// « Contrat de Syndic.xlsx » (SharePoint Reality > Documents), celui-la meme que le flow
// PowerApps MYTHEC remplissait via l'Office Script ContratReplace.
//
// Le contrat s'imprime sur DEUX COLONNES independantes de HUIT cases chacune : chaque liste
// ci-dessous est un flux vertical, rendu cote a cote. Un bloc est un paragraphe (chaine) ou
// une ligne de tableau : ses cellules avec leur largeur en cases (la somme fait 8, moins les
// cases couvertes par une cellule plus haute) et, si la cellule descend sur plusieurs
// lignes, sa hauteur. Les valeurs variables sont des placeholders \`[Xxx]\` resolus a
// l'affichage.
//
// Le contrat type evolue avec la loi (le texte cite les decrets de 2015, 2020 et 2025) :
// quand le cabinet met a jour son classeur, on relance le script et on relit le diff.
//
// ${pleineLargeur.length} blocs pleine largeur, ${flux.gauche.length} a gauche (dont ${nbLignes(flux.gauche)} lignes de tableau),
// ${flux.droite.length} a droite (dont ${nbLignes(flux.droite)} lignes de tableau), ${placeholders.size} placeholders distincts.

/** Une cellule de tableau : son texte (vide = case vide qui tient la place), sa largeur en cases sur ${LARGEUR}, sa hauteur en lignes. */
export interface CelluleGabarit {
  readonly texte: string;
  readonly largeur: number;
  readonly hauteur?: number;
}

/** Un bloc : un paragraphe, ou les cellules d'une ligne de tableau. */
export type BlocGabarit = string | readonly CelluleGabarit[];

/** Le nombre de cases d'une colonne du classeur : l'unite des largeurs. */
export const CASES_PAR_COLONNE = ${LARGEUR};

/** Blocs sur TOUTE la largeur, en tete de document (titre, mention des decrets). */
export const GABARIT_PLEINE_LARGEUR: readonly string[] = [
${liste(pleineLargeur)}
] as const;

/** Colonne de gauche du contrat, de haut en bas. */
export const GABARIT_GAUCHE: readonly BlocGabarit[] = [
${liste(flux.gauche)}
] as const;

/** Colonne de droite du contrat, de haut en bas. */
export const GABARIT_DROITE: readonly BlocGabarit[] = [
${liste(flux.droite)}
] as const;

/** Tous les placeholders du gabarit, pour le test de couverture. */
export const PLACEHOLDERS_GABARIT: readonly string[] = [
${[...placeholders].sort().map((p) => "  " + JSON.stringify(p) + ",").join("\n")}
] as const;
`;

writeFileSync(SORTIE, contenu, "utf8");
console.log(
  `${SORTIE} : ${pleineLargeur.length} pleine largeur, ${flux.gauche.length} gauche (${nbLignes(flux.gauche)} lignes de tableau), ${flux.droite.length} droite (${nbLignes(flux.droite)} lignes), ${placeholders.size} placeholders.`,
);
