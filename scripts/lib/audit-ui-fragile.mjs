// Montages responsive fragiles connus (REA-497), pour scripts/audit-ui.mjs. INFO, non bloquant.
//
//   cont   un @container dont le parent direct (meme fichier) est en flex-col + items-start,
//          et qui n'a lui-meme aucune largeur (w-full, w-[..], w-screen, flex-1, self-stretch,
//          basis-..) : la carte retombe a 0 px (cas du lecteur de mail, 04/11/2026).
//   table  <table brut sans ancetre overflow-x-auto / overflow-auto / overflow-x-scroll
//          dans le meme fichier (le composant <Table> de ui/ s'en charge lui-meme).
//   larg   largeur fixe w-[NNNpx] / min-w-[NNNpx] >= 400 sans prefixe responsive, hors
//          ancetre qui defile (overflow-x-auto : un min-w y est voulu).
//
// Heuristique : lecture texte du JSX (un mini-scanner de balises), pas un vrai parseur.
// Un parent ou un conteneur defini dans un AUTRE fichier n'est pas vu : faux positifs possibles,
// d'ou le statut INFO.

const SEUIL_LARGEUR = 400;

/** Balises JSX ouvrantes/fermantes de `texte`, avec leur texte et leur offset. */
export function balises(texte) {
  const res = [];
  const n = texte.length;
  let i = 0;
  while (i < n) {
    if (texte[i] !== "<") {
      i++;
      continue;
    }
    const fermante = texte[i + 1] === "/";
    const debutNom = i + (fermante ? 2 : 1);
    const m = /^[A-Za-z][\w.]*/.exec(texte.slice(debutNom, debutNom + 60));
    // "a < b" ou generique "Array<T>" : on exige un nom de balise et pas d'identifiant juste avant
    const avant = texte.slice(Math.max(0, i - 1), i);
    if (!m || (!fermante && /[\w\])]/.test(avant))) {
      i++;
      continue;
    }
    // fin de la balise : le premier ">" hors accolades et hors chaines
    let j = debutNom + m[0].length;
    let accolades = 0;
    let guillemet = null;
    for (; j < n; j++) {
      const c = texte[j];
      if (guillemet) {
        if (c === guillemet && texte[j - 1] !== "\\") guillemet = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") guillemet = c;
      else if (c === "{") accolades++;
      else if (c === "}") accolades--;
      else if (c === ">" && accolades <= 0 && texte[j - 1] !== "=") break;
    }
    const brut = texte.slice(i, j + 1);
    res.push({
      nom: m[0],
      fermante,
      autoFermante: !fermante && texte[j - 1] === "/",
      texte: brut,
      offset: i,
    });
    i = j + 1;
  }
  return res;
}

const classe = (texte, re) => re.test(texte);
const FLEX_COL = /(?<![\w:-])flex-col(?![\w-])/;
const ITEMS_START = /(?<![\w:-])items-start(?![\w-])/;
const CONTAINER = /(?<![\w:-])@container(?![\w-])/;
const A_UNE_LARGEUR = /(?<![\w:-])(?:w-full|w-screen|w-\[|w-\d|flex-1|flex-auto|self-stretch|basis-)/;
const DEFILE = /overflow-(?:x-)?(?:auto|scroll)/;
const LARGEUR_FIXE = /(?<![\w:-])(?:min-)?w-\[(\d+)px\]/g;

function ligneDe(texte, offset) {
  let l = 1;
  for (let i = 0; i < offset; i++) if (texte.charCodeAt(i) === 10) l++;
  return l;
}

/** Retourne [{ regle: "cont" | "table" | "larg", ligne }] pour un fichier .tsx. */
export function analyserFragile(texte) {
  const trouves = [];
  const pile = [];
  for (const b of balises(texte)) {
    if (b.fermante) {
      // depile jusqu'a la balise de meme nom (tolerant aux balises mal fermees)
      for (let k = pile.length - 1; k >= 0; k--) {
        if (pile[k].nom === b.nom) {
          pile.length = k;
          break;
        }
      }
      continue;
    }
    const parent = pile[pile.length - 1];

    if (classe(b.texte, CONTAINER)) {
      const parentFragile = parent && classe(parent.texte, FLEX_COL) && classe(parent.texte, ITEMS_START) && !classe(parent.texte, /(?<![\w:-])w-full/);
      if (parentFragile && !classe(b.texte, A_UNE_LARGEUR)) trouves.push({ regle: "cont", ligne: ligneDe(texte, b.offset) });
    }

    if (b.nom === "table" && !pile.some((p) => classe(p.texte, DEFILE))) {
      trouves.push({ regle: "table", ligne: ligneDe(texte, b.offset) });
    }

    // Un min-w dans un ancetre qui defile (tableau, calendrier) est voulu : pas de debordement.
    const dansDefilement = pile.some((p) => classe(p.texte, DEFILE)) || classe(b.texte, DEFILE);
    for (const m of dansDefilement ? [] : b.texte.matchAll(LARGEUR_FIXE)) {
      if (Number(m[1]) >= SEUIL_LARGEUR) trouves.push({ regle: "larg", ligne: ligneDe(texte, b.offset + m.index) });
    }

    if (!b.autoFermante) pile.push(b);
  }
  return trouves;
}
