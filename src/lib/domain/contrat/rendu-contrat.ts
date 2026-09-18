// Le contrat de syndic comme ARBRE DE RENDU pur : titre, paragraphes, tableaux. C'est la
// seule lecture du gabarit ; l'ecran (composant React) et le PDF (HTML A4 -> Chromium) en
// font deux dessins du meme arbre, sans redecider ce qui est un titre ou une cellule de
// montant. Retour du test du 17/09/2026 : les grilles tarifaires doivent etre de vrais
// tableaux, aux colonnes alignees, qui ne se coupent pas entre deux pages.
//
// Depuis le 18/09/2026 le gabarit porte les FUSIONS du classeur : chaque cellule a sa
// largeur en cases (sur 8) et sa hauteur en lignes. Le tableau se dessine sur huit
// colonnes egales, une cellule couvre `etendue` colonnes et `portee` lignes. Plus rien
// n'est devine a partir des textes, sauf ce que le classeur ne sait pas dire : un titre
// (capitales ou numero) et une ligne d'en-tete (capitales).

import type { ChampsContrat } from "./champs-contrat";
import { CASES_PAR_COLONNE, GABARIT_DROITE, GABARIT_GAUCHE, GABARIT_PLEINE_LARGEUR, type BlocGabarit } from "./gabarit-contrat";
import { remplirTexte, tableRemplacement } from "./remplir-gabarit";

export type NoeudContrat =
  | { type: "titre"; texte: string }
  | { type: "paragraphe"; texte: string }
  /** Un tableau sur `colonnes` colonnes egales (les cases du classeur). */
  | { type: "tableau"; colonnes: number; lignes: LigneTableau[] }
  /** Le bloc de signatures, les parties cote a cote avec la place pour signer. */
  | { type: "signatures"; parties: string[] };

/** La ligne du classeur ou les deux parties signent, cote a cote. */
const PARTIES_SIGNATAIRES = ["Le syndicat", "Le syndic"];

export interface LigneTableau {
  /** Toutes les cellules pleines en capitales : une ligne d'en-tete. */
  enTete: boolean;
  cellules: CelluleTableau[];
}

export interface CelluleTableau {
  texte: string;
  montant: boolean;
  /** Le nombre de colonnes couvertes (colspan). */
  etendue: number;
  /** Le nombre de lignes couvertes (rowspan), quand il y en a plus d'une. */
  portee?: number;
}

export interface ArbreContrat {
  /** Le titre du contrat (« CONTRAT DE SYNDIC "TOUT SAUF" N° »). */
  titre: string;
  /** Les mentions sous le titre (decrets). */
  enTete: string[];
  gauche: NoeudContrat[];
  droite: NoeudContrat[];
}

/** Un titre de section : ligne courte, en capitales ou numerotee (« 2. DUREE DU CONTRAT »).
 *  Le classeur ne porte aucun style exploitable, on deduit de la forme du texte. */
export function estTitre(texte: string): boolean {
  // Numerote : un titre meme long (« 7.1.3. Prestations optionnelles qui peuvent... »), meme
  // sur deux lignes (« 7.2.2. ... \n(au-dela du contenu du forfait...) »). Au-dela de 140
  // caracteres c'est un paragraphe qui commence par un numero (« 8.4 Préparation... »).
  // Numero suivi d'une lettre : « 5597.50 € HT, soit 6717 € TTC » n'est pas un titre.
  if (/^\d+(\.\d+)*\.?\s+\p{L}/u.test(texte)) return texte.length <= 140;
  // « ANNEXE 1 AU CONTRAT DE SYNDIC \n LISTE NON LIMITATIVE… » : un titre en capitales sur deux lignes.
  if (texte.includes("\n")) return texte.startsWith("ANNEXE ") ? texte.length <= 260 : texte.length <= 200 && texte.split("\n").every((l) => estCapitales(l));
  return texte.length <= 90 && estCapitales(texte);
}

function estCapitales(texte: string): boolean {
  const lettres = texte.replace(/[^A-Za-zÀ-ÿ]/g, "");
  return lettres.length > 3 && lettres === lettres.toUpperCase();
}

/** Une cellule d'en-tete : sa premiere ligne est en capitales (« MODALITE DE TARIFICATION\nconvenues »). */
function estCelluleEnTete(texte: string): boolean {
  return estCapitales(texte.split("\n")[0] ?? "");
}

/** Une cellule de montant : « 163.65 », « 163,65 € », « 1 234.00 ». */
export function estMontant(texte: string): boolean {
  return /^[\d\s .,]+(€|EUR)?$/.test(texte.trim()) && /\d/.test(texte);
}

function colonne(blocs: readonly BlocGabarit[], table: Record<string, string>, options: { fraisPostauxReels?: boolean }): NoeudContrat[] {
  const noeuds: NoeudContrat[] = [];
  let serie: LigneTableau[] = [];
  const vider = () => {
    // Un en-tete sans aucune ligne : le classeur repetait « PRESTATIONS | DÉTAILS » en haut de
    // chaque page ; ici le <thead> se repete tout seul, l'en-tete orphelin ne sert a rien.
    if (serie.some((l) => !l.enTete)) noeuds.push({ type: "tableau", colonnes: CASES_PAR_COLONNE, lignes: serie });
    serie = [];
  };
  for (const bloc of blocs) {
    if (typeof bloc === "string") {
      vider();
      const texte = remplirTexte(bloc, table, options);
      noeuds.push(estTitre(texte) ? { type: "titre", texte } : { type: "paragraphe", texte });
      continue;
    }
    // La ligne ou les deux parties signent, cote a cote : un bloc de signatures, pas un tableau.
    if (bloc.length === PARTIES_SIGNATAIRES.length && bloc.every((c, i) => c.texte === PARTIES_SIGNATAIRES[i])) {
      vider();
      noeuds.push({ type: "signatures", parties: [...PARTIES_SIGNATAIRES] });
      continue;
    }
    const cellules: CelluleTableau[] = bloc.map((c) => {
      const texte = remplirTexte(c.texte, table, options);
      return { texte, montant: estMontant(texte), etendue: c.largeur, ...(c.hauteur && c.hauteur > 1 ? { portee: c.hauteur } : {}) };
    });
    const pleines = cellules.filter((c) => c.texte);
    const enTete = pleines.length > 0 && pleines.every((c) => estCelluleEnTete(c.texte));
    // Un en-tete au milieu d'une grille : le classeur le repetait en haut de chaque page. Le
    // <thead> se repete tout seul, on ne garde que le premier.
    if (enTete && serie.length > 0) continue;
    serie.push({ enTete, cellules });
  }
  vider();
  return noeuds;
}

export function arbreContrat(champs: ChampsContrat): ArbreContrat {
  const table = tableRemplacement(champs);
  const options = { fraisPostauxReels: champs.fraisPostauxReels };
  const [titre, ...enTete] = GABARIT_PLEINE_LARGEUR.map((b) => remplirTexte(b, table, options));
  const droite = colonne(GABARIT_DROITE, table, options);
  if (champs.conditionsParticulieres) {
    droite.push({ type: "titre", texte: "CONDITIONS PARTICULIÈRES" }, { type: "paragraphe", texte: champs.conditionsParticulieres });
  }
  return { titre: titre ?? "", enTete, gauche: colonne(GABARIT_GAUCHE, table, options), droite };
}
