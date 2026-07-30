// Transcription DETERMINISTE d'un tableau de tantièmes depuis la COUCHE TEXTE d'un PDF.
// Étape 6 du chantier extraction (bug report S0306, cause 2).
//
// POURQUOI. L'extraction patrimoine est full-LLM : le modèle RECOPIE des chiffres. C'est
// exactement le mode banni de la compta après l'écart de 122,61 € — d'où
// `parseur-grand-livre-positions`, qui transcrit par positions x et a ramené l'écart à 0,00
// sur 835 écritures. Les tantièmes sont aussi critiques que les écritures : sur S0306, faute
// de pouvoir lire un tableau scanné, le modèle a FABRIQUÉ ~1 000 × 38 lots.
//
// MÊME PRINCIPE, PAS LE MÊME CODE. Le grand livre a deux colonnes de montant (débit/crédit)
// et des pièges de colonnes de solde ; un tableau de tantièmes a une colonne de LOTS et une
// colonne de VALEURS. On réutilise `reconstruireLignes` et la détection par EN-TÊTES
// IMPRIMÉS (page par page : la mise en page change d'un syndic à l'autre, et parfois d'une
// page à l'autre), pas la logique métier.
//
// CE PARSEUR NE DEVINE RIEN. Pas d'en-tête reconnaissable -> il rend `null`, et l'appelant
// garde son chemin actuel (LLM ou OCR). Un tableau lu mais qui ne boucle pas est refusé plus
// haut par le garde-fou arithmétique (domain/garde-extraction) : ici on transcrit, on ne juge
// pas.

import type { ItemTexte, PageTexte } from "@/lib/reprise/adapters/shared/pdf-texte";

/** Colonnes d'un tableau de tantièmes, repérées par leurs en-têtes imprimés. */
export interface ColonnesTantiemes {
  /** Centre x de la colonne des numéros de lot. */
  lotX: number;
  /** Centre x de la colonne des tantièmes. */
  tantiemeX: number;
  /** y de la ligne d'en-tête : on ne lit que les lignes SOUS elle. */
  enteteY: number;
}

/** Une ligne transcrite : un lot, un tantième. */
export interface LigneTantieme {
  lot: number;
  valeur: number;
}

export interface ResultatParsageTantiemes {
  lignes: LigneTantieme[];
  /** Total imprimé en pied de tableau, s'il a été trouvé (le `totalAttendu` de la clé). */
  totalImprime?: number;
  /** Pages où aucune colonne n'a pu être détectée (utile au refus actionnable). */
  pagesNonLues: number[];
}

function plier(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const MOTS_LOT = ["n° de lot", "no de lot", "numero de lot", "n° lot", "lot n", "lot"];
const MOTS_TANTIEME = ["tantieme", "tantiemes", "millieme", "milliemes", "quote-part", "quotes-parts"];
const MOTS_TOTAL = ["total", "totaux", "ensemble"];

/** Centre x d'un item. */
const centre = (it: ItemTexte): number => it.x + it.largeur / 2;

/**
 * Détecte les colonnes « lot » et « tantième » d'une page par ses EN-TÊTES imprimés.
 * `null` si les deux ne sont pas trouvés : on ne devine pas une mise en page.
 */
export function detecterColonnesTantiemes(page: PageTexte): ColonnesTantiemes | null {
  for (const ligne of page.lignes) {
    let lotX: number | null = null;
    let tantiemeX: number | null = null;
    for (const it of ligne.items) {
      const mot = plier(it.chaine.trim());
      if (mot === "") continue;
      // Le tantième d'abord : « quote-part de lot » contiendrait « lot ».
      if (tantiemeX === null && MOTS_TANTIEME.some((m) => mot.includes(m))) tantiemeX = centre(it);
      else if (lotX === null && MOTS_LOT.some((m) => mot.includes(m))) lotX = centre(it);
    }
    if (lotX !== null && tantiemeX !== null && lotX !== tantiemeX) {
      return { lotX, tantiemeX, enteteY: ligne.y };
    }
  }
  return null;
}

/** Entier lu dans une chaîne de cellule ("1 234", "1.234", "153") ; null si ce n'en est pas un. */
function entier(chaine: string): number | null {
  const nettoye = chaine.replace(/[\s .  ]/g, "");
  if (!/^\d+$/.test(nettoye)) return null;
  const n = Number(nettoye);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** L'item le plus proche d'un x de colonne, dans une tolérance. */
function itemPresDe(items: readonly ItemTexte[], x: number, tolerance: number): ItemTexte | undefined {
  let meilleur: ItemTexte | undefined;
  let meilleureDistance = tolerance;
  for (const it of items) {
    const d = Math.abs(centre(it) - x);
    if (d <= meilleureDistance) {
      meilleur = it;
      meilleureDistance = d;
    }
  }
  return meilleur;
}

/**
 * Transcrit les tableaux de tantièmes d'un lot de pages. Les colonnes sont redétectées
 * PAGE PAR PAGE (une page de suite peut avoir une autre mise en page, ou pas d'en-tête —
 * elle est alors comptée en `pagesNonLues`, ce qui alimente le refus actionnable).
 *
 * `toleranceX` : demi-largeur d'appariement d'une cellule à sa colonne, en unités PDF.
 */
export function parserTantiemesPositions(
  pages: readonly PageTexte[],
  toleranceX = 30,
): ResultatParsageTantiemes {
  const lignes: LigneTantieme[] = [];
  const pagesNonLues: number[] = [];
  let totalImprime: number | undefined;
  const vus = new Set<number>();

  pages.forEach((page, i) => {
    const colonnes = detecterColonnesTantiemes(page);
    if (!colonnes) {
      pagesNonLues.push(i + 1);
      return;
    }
    for (const ligne of page.lignes) {
      if (ligne.y >= colonnes.enteteY) continue; // au-dessus de l'en-tete : hors tableau
      const texteLigne = plier(ligne.items.map((it) => it.chaine).join(" "));
      const cellTantieme = itemPresDe(ligne.items, colonnes.tantiemeX, toleranceX);
      const valeur = cellTantieme ? entier(cellTantieme.chaine) : null;

      // Ligne de TOTAL : elle porte le mot et une valeur, mais pas de numero de lot.
      if (MOTS_TOTAL.some((m) => texteLigne.includes(m)) && valeur !== null) {
        // On garde le PLUS GRAND total vu : un pied de page intermediaire ("sous-total")
        // est toujours inferieur au total general.
        totalImprime = totalImprime === undefined ? valeur : Math.max(totalImprime, valeur);
        continue;
      }

      const cellLot = itemPresDe(ligne.items, colonnes.lotX, toleranceX);
      const lot = cellLot ? entier(cellLot.chaine) : null;
      if (lot === null || valeur === null || lot === 0 || valeur === 0) continue;
      // Un lot ne peut apparaitre qu'UNE fois dans un tableau de cle : un doublon vient
      // d'un en-tete repete ou d'une page dupliquee, on ne l'additionne pas.
      if (vus.has(lot)) continue;
      vus.add(lot);
      lignes.push({ lot, valeur });
    }
  });

  return {
    lignes: lignes.sort((a, b) => a.lot - b.lot),
    ...(totalImprime !== undefined ? { totalImprime } : {}),
    pagesNonLues,
  };
}
