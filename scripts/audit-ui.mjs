#!/usr/bin/env node
// Audit du systeme visuel (refonte UI 2026-09). Lecture seule, zero dependance.
//
//   node scripts/audit-ui.mjs                 -> tableau par dossier + verdict
//   node scripts/audit-ui.mjs src/components/affaires --lignes
//                                              -> chaque occurrence (fichier:ligne)
//
// Regle : un dossier declare MIGRE (liste ci-dessous) doit etre a ZERO sur les
// compteurs bloquants, sinon le script sort en erreur (a lancer avant chaque commit
// d'ecran). Les autres dossiers ne font que mesurer le chemin qui reste.
//
// Ce qui est compte :
//   px       text-[Npx]                       -> echelle : text-meta/body/title/page/figure
//   tw       text-xs|sm|base|lg|xl|2xl...     -> idem
//   ink-4    text-ink-4                       -> ink-3 (ou ink-2 si c'est un label lisible)
//   vert     bg-green-700 hors ui/ et sidebar -> Button primary (UNE par ecran) ou SegmentedControl
//   btn      <button brut hors ui/            -> Button / ButtonLink (info, non bloquant)
//   hex      #rrggbb dans une className       -> tokens
//   ombre    shadow-sm|md|lg|xl               -> aucune sur une carte ; shadow-2 sur modale/toast
//   mono     font-mono                        -> code copro seulement (info)
//   ink-3    text-ink-3                       -> tertiaire seulement (info)
//   carte    rounded-md border border-line bg-surface -> Card / Rows / Table (rayon 12 + relief)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RACINE = process.cwd();
const SRC = join(RACINE, "src");

// Dossiers migres : compteurs bloquants a zero, sinon exit 1. Depuis l'etape 2
// (2026-09-10), TOUT src/ est migre : la liste est le depot entier.
const MIGRES = ["src"];

const BLOQUANTS = ["px", "tw", "ink-4", "vert", "hex", "ombre", "carte"];

const REGLES = {
  px: /\btext-\[\d+(?:\.\d+)?px\]/g,
  tw: /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl)\b/g,
  "ink-4": /\btext-ink-4\b/g,
  // un fond vert PLEIN ; les teintes (bg-green-700/5 = affordances d'edition) ne comptent pas
  vert: /\bbg-green-700\b(?!\/)/g,
  btn: /<button\b/g,
  hex: /(?:border|bg|text)-\[#[0-9a-fA-F]{3,8}\]/g,
  ombre: /\bshadow-(?:sm|md|lg|xl|2xl)\b/g,
  mono: /\bfont-mono\b/g,
  "ink-3": /\btext-ink-3\b/g,
  // conteneur de carte fait main (rayon 6 sans relief) : passer par <Card> / <Rows> / <Table>
  carte: /\brounded-md border border-line bg-surface\b(?!-)|\bborder border-line rounded-md bg-surface\b(?!-)|\bbg-surface border border-line rounded-md\b/g,
};

// Le vert et les <button> bruts sont LEGITIMES dans les primitives, la sidebar (nav
// active) et la frise du cycle (indicateur d'avancement, pas un bouton).
const EXEMPTS = {
  // Le document ODJ est un DOCUMENT (A4, echelle papier 12 px / 7,5 px en pied), pas une
  // page d'UI : il garde ses tailles. Ses couleurs, elles, sont sur les tokens.
  // Les morceaux de l'editable (saisie inline, valeurs, ajouts libres, lignes de section,
  // points) rendent DANS la feuille : memes tailles papier.
  px: [
    "src/components/odj/document-odj.tsx",
    "src/components/odj/document-odj-editable.tsx",
    "src/components/odj/saisie-inline.tsx",
    "src/components/odj/valeur-editable.tsx",
    "src/components/odj/ajouts-libres.tsx",
    "src/components/odj/lignes-section-editables.tsx",
    "src/components/odj/points-editables.tsx",
  ],
  vert: [
    "src/components/ui",
    "src/components/layout/sidebar.tsx",
    "src/components/parcours/frise-etapes.tsx",
    // barre de progression du wizard sinistre (= Progress), pas un bouton
    "src/components/sinistre/WizardScreen.tsx",
  ],
  btn: ["src/components/ui"],
  carte: ["src/components/ui"],
};

function* fichiers(dir) {
  for (const nom of readdirSync(dir)) {
    const chemin = join(dir, nom);
    const st = statSync(chemin);
    if (st.isDirectory()) yield* fichiers(chemin);
    else if (/\.(tsx|ts|css)$/.test(nom) && !/\.test\.tsx?$/.test(nom)) yield chemin;
  }
}

function rel(chemin) {
  return relative(RACINE, chemin).split(sep).join("/");
}

/** Dossier de regroupement : src/app/<x> ou src/components/<x> (2 niveaux), sinon src/<x>. */
function groupe(r) {
  const parts = r.split("/");
  if ((parts[1] === "app" || parts[1] === "components") && parts.length > 3) return parts.slice(0, 3).join("/");
  return parts.slice(0, 2).join("/");
}

function exempt(regle, r) {
  return (EXEMPTS[regle] ?? []).some((p) => r === p || r.startsWith(p + "/"));
}

const args = process.argv.slice(2);
const avecLignes = args.includes("--lignes");
const filtre = args.find((a) => !a.startsWith("--"));

const parGroupe = new Map();
const details = [];

for (const chemin of fichiers(SRC)) {
  const r = rel(chemin);
  if (filtre && !r.startsWith(filtre.replace(/\\/g, "/").replace(/\/$/, ""))) continue;
  const texte = readFileSync(chemin, "utf8");
  const g = groupe(r);
  const compteurs = parGroupe.get(g) ?? Object.fromEntries(Object.keys(REGLES).map((k) => [k, 0]));
  const lignes = texte.split("\n");
  for (const [regle, re] of Object.entries(REGLES)) {
    if (exempt(regle, r)) continue;
    lignes.forEach((l, i) => {
      const n = (l.match(re) ?? []).length;
      if (n === 0) return;
      compteurs[regle] += n;
      if (avecLignes) details.push(`${r}:${i + 1}  [${regle}]  ${l.trim().slice(0, 110)}`);
    });
  }
  parGroupe.set(g, compteurs);
}

const cles = Object.keys(REGLES);
const largeur = Math.max(...[...parGroupe.keys()].map((g) => g.length), 8);
const entete = ["dossier".padEnd(largeur), ...cles.map((k) => k.padStart(6))].join("  ");
console.log(entete);
console.log("-".repeat(entete.length));
const totaux = Object.fromEntries(cles.map((k) => [k, 0]));
let echec = false;
for (const [g, c] of [...parGroupe.entries()].sort()) {
  const migre = MIGRES.some((m) => g === m || g.startsWith(m + "/"));
  const ko = migre && BLOQUANTS.some((k) => c[k] > 0);
  if (ko) echec = true;
  const marque = migre ? (ko ? " KO" : " ok") : "";
  console.log([g.padEnd(largeur), ...cles.map((k) => String(c[k]).padStart(6))].join("  ") + marque);
  for (const k of cles) totaux[k] += c[k];
}
console.log("-".repeat(entete.length));
console.log(["TOTAL".padEnd(largeur), ...cles.map((k) => String(totaux[k]).padStart(6))].join("  "));

if (avecLignes && details.length) {
  console.log("\n" + details.join("\n"));
}

console.log(`\nBloquants : ${BLOQUANTS.join(", ")}. Dossiers migres : ${MIGRES.join(", ")}.`);
if (echec) {
  console.error("\nKO : un dossier migre n'est pas a zero.");
  process.exit(1);
}
