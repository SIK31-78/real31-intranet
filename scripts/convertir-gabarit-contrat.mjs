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
// data/5 Contrat de Syndic-S234-*.pdf). La colonne de gauche occupe les cellules 1 a 8,
// celle de droite les cellules 9 a 17, la colonne du milieu servant de gouttiere. Chaque
// colonne est un FLUX INDEPENDANT : « ENTRE LES SOUSSIGNES PARTIES » a gauche fait face a
// « PREAMBULE » a droite. On extrait donc deux listes, et le document les rend cote a
// cote - reconstituer un flux unique demanderait de connaitre les sauts de page du
// classeur, qu'Excel ne donne pas.
//
// Les cellules sont fusionnees horizontalement (meme valeur sur toute la largeur de la
// colonne) et verticalement (meme valeur sur plusieurs lignes) : on dedoublonne dans les
// deux sens, chaque colonne independamment.
//
// Usage : node scripts/convertir-gabarit-contrat.mjs "docs/Contrat de Syndic.xlsx"
// Sortie : src/lib/domain/contrat/gabarit-contrat.ts

import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";

const SOURCE = process.argv[2] ?? "docs/Contrat de Syndic.xlsx";
const SORTIE = process.argv[3] ?? "src/lib/domain/contrat/gabarit-contrat.ts";

/** Derniere colonne de la moitie gauche (la 9e est la gouttiere). */
const FIN_COLONNE_GAUCHE = 8;

function texteDe(cell) {
  let v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if (v.result !== undefined) v = v.result;
    else if (v.text !== undefined) v = v.text;
    else return "";
  }
  return String(v);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SOURCE);
const ws = wb.worksheets[0];

const pleineLargeur = [];
const gauche = [];
const droite = [];

/**
 * Les valeurs REELLES d'une moitie de ligne. Deux cas a distinguer :
 *  - fusion horizontale : la meme valeur se repete (parfois tronquee) -> un paragraphe ;
 *  - ligne de grille tarifaire : « Libelle | 136.38 | 163.65 » dans des cellules
 *    distinctes -> il faut les garder TOUTES, sinon on perd les montants (c'etait le cas :
 *    18 placeholders de tarifs disparaissaient).
 */
function valeursDe(cellules) {
  const distinctes = [];
  for (const t of cellules) if (!distinctes.includes(t)) distinctes.push(t);
  // Ecarte les troncatures de fusion : une valeur entierement contenue dans une autre,
  // plus longue, de la meme moitie.
  return distinctes.filter(
    (t) => !distinctes.some((a) => a !== t && a.length > t.length && a.includes(t)),
  );
}

/** Cle de comparaison d'un bloc, pour la deduplication verticale. */
const cleDe = (bloc) => (Array.isArray(bloc) ? bloc.join("") : bloc);

ws.eachRow({ includeEmpty: false }, (row) => {
  const cellulesG = [];
  const cellulesD = [];
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    const t = texteDe(cell).replace(/\r\n/g, "\n").trim();
    if (!t) return;
    (col <= FIN_COLONNE_GAUCHE ? cellulesG : cellulesD).push(t);
  });

  const vG = valeursDe(cellulesG);
  const vD = valeursDe(cellulesD);

  // PLEINE LARGEUR : une cellule fusionnee sur TOUTE la largeur se retrouve identique des
  // deux cotes (le titre du contrat, la mention des decrets). Sans ce cas, elle serait
  // imprimee DEUX FOIS, une par colonne.
  if (vG.length === 1 && vD.length === 1 && vG[0] === vD[0]) {
    if (vG[0] !== pleineLargeur[pleineLargeur.length - 1]) pleineLargeur.push(vG[0]);
    return;
  }

  for (const [valeurs, flux] of [
    [vG, gauche],
    [vD, droite],
  ]) {
    if (valeurs.length === 0) continue;
    const bloc = valeurs.length === 1 ? valeurs[0] : valeurs;
    // Fusion verticale : un bloc etale sur N lignes ne se garde qu'une fois, par colonne.
    if (cleDe(bloc) !== cleDe(flux[flux.length - 1])) flux.push(bloc);
  }
});

const placeholders = new Set();
for (const b of [...pleineLargeur, ...gauche, ...droite])
  for (const texte of Array.isArray(b) ? b : [b])
    for (const m of texte.matchAll(/\[[^\]\n]+\]/g)) placeholders.add(m[0]);

const liste = (blocs) => blocs.map((b) => "  " + JSON.stringify(b) + ",").join("\n");

const contenu = `// Gabarit du contrat de syndic REAL31 - GENERE, NE PAS EDITER A LA MAIN.
//
// Produit par \`node scripts/convertir-gabarit-contrat.mjs\` a partir du classeur
// « Contrat de Syndic.xlsx » (SharePoint Reality > Documents), celui-la meme que le flow
// PowerApps MYTHEC remplissait via l'Office Script ContratReplace.
//
// Le contrat s'imprime sur DEUX COLONNES independantes : chaque liste ci-dessous est un
// flux vertical, rendu cote a cote. Les valeurs variables sont des placeholders \`[Xxx]\`
// resolus a l'affichage.
//
// Le contrat type evolue avec la loi (le texte cite les decrets de 2015, 2020 et 2025) :
// quand le cabinet met a jour son classeur, on relance le script et on relit le diff.
//
// ${pleineLargeur.length} blocs pleine largeur, ${gauche.length} a gauche, ${droite.length} a droite,
// ${placeholders.size} placeholders distincts.

/** Un bloc : un paragraphe, ou les cellules d'une ligne de grille tarifaire. */
export type BlocGabarit = string | readonly string[];

/** Blocs sur TOUTE la largeur, en tete de document (titre, mention des decrets). */
export const GABARIT_PLEINE_LARGEUR: readonly string[] = [
${liste(pleineLargeur)}
] as const;

/** Colonne de gauche du contrat, de haut en bas. */
export const GABARIT_GAUCHE: readonly BlocGabarit[] = [
${liste(gauche)}
] as const;

/** Colonne de droite du contrat, de haut en bas. */
export const GABARIT_DROITE: readonly BlocGabarit[] = [
${liste(droite)}
] as const;

/** Les placeholders presents dans le gabarit, pour verifier qu'on sait tous les remplir. */
export const PLACEHOLDERS_GABARIT: readonly string[] = [
${[...placeholders].sort().map((p) => "  " + JSON.stringify(p) + ",").join("\n")}
] as const;
`;

writeFileSync(SORTIE, contenu, "utf8");
console.log(
  `pleine largeur ${pleineLargeur.length}, gauche ${gauche.length}, droite ${droite.length} blocs, ` +
    `${placeholders.size} placeholders -> ${SORTIE} (${contenu.length} caracteres)`,
);
