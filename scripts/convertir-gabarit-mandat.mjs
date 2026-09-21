// Convertit le contrat de mandat du gestionnaire d'une ASL / AFUL (modele Word du cabinet)
// en module TypeScript versionne, dans le MEME format que le gabarit du contrat de syndic
// (gabarit-contrat.ts) : des paragraphes et des lignes de tableau avec leurs largeurs.
//
// Le modele : docs/CONTRAT DE MANDAT DU GESTIONNAIRE PROFESSIONNEL.docx (Sekou, 21/09/2026),
// un contrat deja rempli pour l'AFUL Ilot Lacroix Bleuets. Le script :
//   1. lit word/document.xml : paragraphes et tableaux, dans l'ordre ; un tableau vide
//      (mise en page de l'en-tete) est ignore ; les largeurs viennent de <w:gridCol>,
//      ramenees a 12 cases ;
//   2. remplace les valeurs propres a ce contrat par les placeholders du contrat de syndic
//      (REMPLACEMENTS ci-dessous) : les montants « x € HT soit y € TTC » sont reconnus par
//      leur TTC et affectes a la prestation du bareme, dans l'ordre du document quand deux
//      prestations ont le meme prix (reunion et visite supplementaires, 223,80 €).
//
// Le texte du cabinet n'est pas retouche. Quand le modele change, on relance le script et on
// relit le diff ; si une valeur litterale a bouge, la ligne de REMPLACEMENTS correspondante
// ne s'applique plus et le placeholder manque : le test de couverture le dira.
//
// Usage : node scripts/convertir-gabarit-mandat.mjs "docs/CONTRAT DE MANDAT DU GESTIONNAIRE PROFESSIONNEL.docx"
// Sortie : src/lib/domain/contrat/gabarit-mandat.ts

import { readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const SOURCE = process.argv[2] ?? "docs/CONTRAT DE MANDAT DU GESTIONNAIRE PROFESSIONNEL.docx";
const SORTIE = process.argv[3] ?? "src/lib/domain/contrat/gabarit-mandat.ts";
const CASES = 12;

// --- Lecture du zip (document.xml seulement), sans dependance.
function lireEntreeZip(buffer, nom) {
  const fin = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const nbEntrees = buffer.readUInt16LE(fin + 10);
  let p = buffer.readUInt32LE(fin + 16);
  for (let i = 0; i < nbEntrees; i++) {
    const methode = buffer.readUInt16LE(p + 10);
    const tailleComp = buffer.readUInt32LE(p + 20);
    const lNom = buffer.readUInt16LE(p + 28);
    const lExtra = buffer.readUInt16LE(p + 30);
    const lComm = buffer.readUInt16LE(p + 32);
    const offset = buffer.readUInt32LE(p + 42);
    const nomEntree = buffer.toString("utf8", p + 46, p + 46 + lNom);
    if (nomEntree === nom) {
      const lNomLocal = buffer.readUInt16LE(offset + 26);
      const lExtraLocal = buffer.readUInt16LE(offset + 28);
      const debut = offset + 30 + lNomLocal + lExtraLocal;
      const data = buffer.subarray(debut, debut + tailleComp);
      return methode === 8 ? inflateRawSync(data) : data;
    }
    p += 46 + lNom + lExtra + lComm;
  }
  throw new Error(`${nom} absent du docx`);
}

const xml = lireEntreeZip(readFileSync(SOURCE), "word/document.xml").toString("utf8");
const body = xml.slice(xml.indexOf("<w:body>"), xml.indexOf("</w:body>"));

const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

/** Le texte d'un paragraphe : les runs, une tabulation par <w:tab/>, un saut par <w:br/>. */
function texteParagraphe(p) {
  const morceaux = [];
  for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
    if (m[0].startsWith("<w:tab")) morceaux.push("\t");
    else if (m[0].startsWith("<w:br")) morceaux.push("\n");
    else morceaux.push(decode(m[1]));
  }
  return morceaux.join("").replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").trim();
}

/** Les paragraphes d'un fragment (cellule ou corps), non vides. */
function paragraphesDe(fragment) {
  return [...fragment.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)].map((m) => texteParagraphe(m[0])).filter(Boolean);
}

// --- Les blocs de premier niveau, dans l'ordre : paragraphe ou tableau.
const blocsBruts = [];
const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[\s>][\s\S]*?<\/w:p>/g;
let m;
while ((m = re.exec(body)) !== null) {
  const frag = m[0];
  if (frag.startsWith("<w:tbl>")) {
    const grid = [...frag.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((g) => Number(g[1]));
    const lignes = [...frag.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)].map((r) => {
      const cellules = [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => {
        const span = Number(/<w:gridSpan w:val="(\d+)"/.exec(c[0])?.[1] ?? 1);
        return { texte: paragraphesDe(c[0]).join("\n"), span };
      });
      return cellules;
    });
    if (lignes.every((l) => l.every((c) => !c.texte))) continue; // tableau de mise en page vide
    blocsBruts.push({ type: "tableau", grid, lignes });
  } else {
    const t = texteParagraphe(frag);
    if (t) blocsBruts.push({ type: "paragraphe", texte: t });
  }
}

// --- Largeurs : les colonnes de la grille Word, ramenees a CASES cases (la colonne de
// 30 twips en bout de tableau est un artefact de Word, ignoree).
function largeursEnCases(grid) {
  const utiles = grid.filter((w) => w > 100);
  const total = utiles.reduce((a, b) => a + b, 0);
  const brutes = utiles.map((w) => (w / total) * CASES);
  const cases = brutes.map((x) => Math.max(1, Math.round(x)));
  // Ajuste la derniere pour retomber juste sur CASES.
  const ecart = CASES - cases.reduce((a, b) => a + b, 0);
  cases[cases.length - 1] += ecart;
  return cases;
}

// --- Remplacements : les valeurs de ce contrat-ci -> les placeholders du contrat de syndic.
const REMPLACEMENTS = [
  ["D’UNE ASL N°4235", "D’UNE [FormeJuridique] N°"],
  ["L’AFUL de l’ensemble immobilier sise à l’adresse suivante : 51 rue Veuve Lacroix et 2 et 4 rue des Bleuets – 92250 La Garenne Colombes", "L’[FormeJuridique] de l’ensemble immobilier sise à l’adresse suivante : [Coproprietes.Adresse1] [Coproprietes.Adresse2] [Coproprietes.Adresse3] – [Coproprietes.CP] [Coproprietes.Ville]"],
  ["Ci-après dénommé l’AFUL Ilôt Lacroix Bleuets", "Ci-après dénommé l’[FormeJuridique] [Coproprietes.Denomination]"],
  ["13 rond point du Souvenir Français", "[Coproprietes.Agence],"],
  ["92250 LA GARENNE COLOMBES,", ""],
  ["mandat donné par l’assemblée générale en date du 14/11/2025", "mandat donné par l’assemblée générale en date du [DateAG]"],
  ["conclu pour une durée de 1 an.", "conclu pour une durée de [DureeContrat]."],
  ["Il prendra effet le 01/01/2026 et prendra fin le 31/12/2026.", "Il prendra effet le [DebutContrat] et prendra fin le [FinContrat]."],
  ["-1 visite et vérification périodique de l’ASL ou de l’AFUL, d’une durée de 1 heure", "- [Coproprietes.NbVisite] visite(s) et vérification(s) périodique(s) de l’ASL ou de l’AFUL, d’une durée de 1 heure"],
  ["sera tenue pour une durée de 2 heures à l’intérieur d’une plage horaire allant de 10 heures à 12h00 et de 14h00 à 20 heures", "sera tenue pour une durée de [Coproprietes.DureeAG] heures à l’intérieur d’une plage horaire allant de 10 heures à 12h00 et de 14h00 à [Coproprietes.FinMaxAG] heures"],
  ["s’élève à la somme de 3 094,16 € hors taxes, soit 3 713 € toutes taxes comprises", "s’élève à la somme de [HonoGestionHT] € hors taxes, soit [FormulaireContratSyndic.HonoGestion] € toutes taxes comprises"],
  ["133.71 € HT / heure, soit 160,45 € TTC / heure", "[TauxHoraireHT] € HT / heure, soit [Tarifs.Tarif.TauxHoraire] € TTC / heure"],
  ["Fait en deux exemplaires et signé ce jour, le 22/10/2025 à La Garenne Colombes", "Fait en deux exemplaires et signé ce jour, le [DateAG] à"],
  ["revotée à chaque assemblée annuelle par les membres de l’AFUL.", "revotée à chaque assemblée annuelle par les membres de l’[FormeJuridique]."],
  ["Pour l’AFUL : A l’adresse", "Pour l’[FormeJuridique] : A l’adresse"],
  // La carte professionnelle et la RC pro : le paragraphe du contrat de syndic est le plus a
  // jour (carte du 25/11/2025, garantie chiffree, zone couverte) ; le modele du mandat datait
  // de 2022 (Sekou, 21/09/2026).
  [
    "Titulaire de la carte professionnelle n° CPI 7801 2016 000 014 479, permettant l’exercice de l’activité de : transaction sur immeubles et fonds de commerces * gestion immobilière * Syndic de copropriété, délivrée par la CCI Paris Ile de France le 25 Novembre 2022. Garanti par GALIAN-SMABTP, 89 rue la Boétie – 75008 Paris sous la référence 110891J.",
    // Sans la date de delivrance de la carte ni le montant de la garantie (Sekou, 21/09/2026 :
    // ils changent, on ne veut pas les tenir a jour dans le mandat).
    "Titulaire de la carte professionnelle n° CPI 7801 2016 000 014 479, permettant l’exercice de l’activité de : transaction sur immeubles et fonds de commerces * gestion immobilière * Syndic de copropriété, délivrée par la CCI Paris Île-de-France. Garanti par GALIAN-SMABTP, 89 rue la Boétie – 75008 Paris sous la référence 110891J, contrat souscrit le 13/12/2004 et couvrant la zone géographique suivante : République Française (France Métropolitaine, DROM-COM).",
  ],
  [
    "Assuré(e) en responsabilité civile professionnelle par MMA IARD – 14 boulevard Marie et Alexandre Oyon – 72030 Le Mans Cedex 9 sous le contrat n° 127 103 751.",
    "Assuré(e) en responsabilité civile professionnelle par MMA IARD – 14 boulevard Marie et Alexandre Oyon – 72030 Le Mans Cedex 9 sous le contrat n° 127 103 751 souscrit le 13/12/2004, couvrant la zone géographique suivante : République Française (France Métropolitaine, DROM-COM).",
  ],
  ["Le représentant de l’AFUL", "Le représentant de l’[FormeJuridique]"],
  ["Le gestionnaire de l’AFUL", "Le gestionnaire de l’[FormeJuridique]"],
];

// Les montants « x € HT soit y € TTC », reconnus par leur TTC. Quand deux prestations ont le
// meme prix, la file donne l'affectation dans l'ordre du document.
const PAR_TTC = {
  "223.80": ["CsSupp", "VisiteSupp"],
  "77.00": ["PublicationStatuts"],
  "94.00": ["DepLieu"],
  "210.00": ["MesConser"],
  "105.00": ["AssExp"],
  "115.00": ["DossierAssureur"],
  "60.00": ["MED", "MED", "MED"],
  "194.00": ["DossierAvocat"],
  "180.00": ["ImmatInitiale"],
  "98.00": ["Echeancier"],
  "445.00": ["Hypotheque", "Hypotheque"],
  "203.00": ["Injonction"],
  "193.00": ["DossierJustice"],
  "380.00": ["EtatDate"],
  "255.00": ["Opposition"],
  "74.00": ["DelivranceCopie", "DelivranceCopie", "DelivranceCopie", "DelivranceCopie"],
};
const files = Object.fromEntries(Object.entries(PAR_TTC).map(([k, v]) => [k, [...v]]));
const inconnus = new Set();
function remplacerMontants(texte) {
  return texte.replace(/(\d[\d\s]*[.,]\d{2})\s?€\s?HT soit (\d[\d\s]*[.,]\d{2})\s?€\s?TTC/g, (tout, _ht, ttc) => {
    const cle = Number(ttc.replace(/\s/g, "").replace(",", ".")).toFixed(2);
    const id = files[cle]?.shift();
    if (!id) {
      inconnus.add(cle);
      return tout;
    }
    return `[${id}HT] € HT soit [Tarifs.Tarif.${id}] € TTC`;
  });
}
function remplacer(texte) {
  let t = texte;
  for (const [de, a] of REMPLACEMENTS) t = t.split(de).join(a);
  return remplacerMontants(t);
}

// --- Assemblage : titre en pleine largeur, puis un seul flux.
const blocs = [];
let titre = "";
for (const b of blocsBruts) {
  if (b.type === "paragraphe") {
    const t = remplacer(b.texte);
    if (!t) continue;
    if (!titre) {
      titre = t;
      continue;
    }
    // Les signataires, cote a cote, separes par une tabulation dans le modele.
    if (t.includes("\t") && /^Le /.test(t)) {
      const parties = t.split("\t").map((x) => x.trim()).filter(Boolean);
      blocs.push(parties.map((x) => ({ texte: x, largeur: CASES / parties.length })));
      continue;
    }
    blocs.push(t.replace(/\t/g, " "));
    continue;
  }
  const largeurs = largeursEnCases(b.grid);
  for (const ligne of b.lignes) {
    let col = 0;
    const cellules = [];
    for (const c of ligne) {
      if (col >= largeurs.length) break; // la colonne artefact de 30 twips
      const largeur = largeurs.slice(col, col + c.span).reduce((a, x) => a + x, 0);
      cellules.push({ texte: remplacer(c.texte), largeur });
      col += c.span;
    }
    if (cellules.every((c) => !c.texte)) continue;
    blocs.push(cellules);
  }
}
// La deuxieme ligne du titre (« D’UNE [FormeJuridique] N° ») est un paragraphe a part dans le modele.
if (blocs[0] && typeof blocs[0] === "string" && /^D’UNE /.test(blocs[0])) titre = `${titre}\n${blocs.shift()}`;

for (const [cle, reste] of Object.entries(files)) if (reste.length > 0) console.warn(`montant ${cle} : ${reste.length} affectation(s) non consommee(s) (${reste.join(", ")})`);
if (inconnus.size > 0) console.warn("montants sans prestation :", [...inconnus].join(", "));

const placeholders = new Set();
for (const b of [titre, ...blocs]) for (const t of typeof b === "string" ? [b] : b.map((c) => c.texte)) for (const x of t.matchAll(/\[[^\]\n]+\]/g)) placeholders.add(x[0]);

const liste = (xs) => xs.map((b) => "  " + JSON.stringify(b) + ",").join("\n");
const contenu = `// Gabarit du contrat de mandat du gestionnaire d'une ASL / AFUL - GENERE, NE PAS EDITER A LA MAIN.
//
// Produit par \`node scripts/convertir-gabarit-mandat.mjs\` a partir du modele Word du cabinet
// « CONTRAT DE MANDAT DU GESTIONNAIRE PROFESSIONNEL.docx » (docs/). Meme format que
// gabarit-contrat.ts, mais UNE colonne de ${CASES} cases : un bloc est un paragraphe (chaine) ou
// une ligne de tableau (cellules avec leur largeur en cases). Placeholders \`[Xxx]\` resolus a
// l'affichage, les memes que le contrat de syndic, plus [FormeJuridique] et
// [Coproprietes.Denomination].
//
// ${blocs.length} blocs (dont ${blocs.filter((b) => typeof b !== "string").length} lignes de tableau), ${placeholders.size} placeholders distincts.

import type { BlocGabarit } from "./gabarit-contrat";

/** Le nombre de cases de la colonne unique : l'unite des largeurs. */
export const CASES_MANDAT = ${CASES};

/** Le titre, sur deux lignes. */
export const TITRE_MANDAT = ${JSON.stringify(titre)};

/** Le contrat, de haut en bas, sur une colonne. */
export const GABARIT_MANDAT: readonly BlocGabarit[] = [
${liste(blocs)}
] as const;

/** Tous les placeholders du gabarit, pour le test de couverture. */
export const PLACEHOLDERS_MANDAT: readonly string[] = [
${[...placeholders].sort().map((p) => "  " + JSON.stringify(p) + ",").join("\n")}
] as const;
`;
writeFileSync(SORTIE, contenu, "utf8");
console.log(`${SORTIE} : ${blocs.length} blocs, ${placeholders.size} placeholders.`);
