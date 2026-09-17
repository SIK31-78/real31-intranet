// Le contrat de syndic comme ARBRE DE RENDU pur : titre, paragraphes, tableaux. C'est la
// seule lecture du gabarit ; l'ecran (composant React) et le PDF (HTML A4 -> Chromium) en
// font deux dessins du meme arbre, sans redecider ce qui est un titre ou une cellule de
// montant. Retour du test du 17/09/2026 : les grilles tarifaires doivent etre de vrais
// tableaux, aux colonnes alignees, qui ne se coupent pas entre deux pages.

import type { ChampsContrat } from "./champs-contrat";
import { GABARIT_DROITE, GABARIT_GAUCHE, GABARIT_PLEINE_LARGEUR, type BlocGabarit } from "./gabarit-contrat";
import { remplirTexte, tableRemplacement } from "./remplir-gabarit";

export type NoeudContrat =
  | { type: "titre"; texte: string }
  | { type: "paragraphe"; texte: string }
  | { type: "tableau"; colonnes: number; lignes: LigneTableau[] };

export interface LigneTableau {
  /** Toutes les cellules en capitales : une ligne d'en-tete. */
  enTete: boolean;
  cellules: CelluleTableau[];
}

export interface CelluleTableau {
  texte: string;
  montant: boolean;
  /** Cette cellule couvre aussi les N-1 lignes suivantes (categorie de l'annexe 1 : « I. - Assemblée générale »). */
  portee?: number;
  /** Cellule couverte par celle de la ligne du dessus : ne pas la dessiner. */
  fusionnee?: boolean;
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
  if (/^\d+(\.\d+)*\.?\s/.test(texte)) return texte.length <= 140;
  if (texte.includes("\n") || texte.length > 90) return false;
  return estCapitales(texte);
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
  let colonnes = 0;
  const vider = () => {
    if (serie.length > 0) noeuds.push({ type: "tableau", colonnes, lignes: fusionnerCategories(serie) });
    serie = [];
  };
  for (const bloc of blocs) {
    if (typeof bloc === "string") {
      vider();
      const texte = remplirTexte(bloc, table, options);
      noeuds.push(estTitre(texte) ? { type: "titre", texte } : { type: "paragraphe", texte });
      continue;
    }
    const cellules = bloc.map((c) => remplirTexte(c, table, options)).map((texte) => ({ texte, montant: estMontant(texte) }));
    const enTete = cellules.every((c) => estCelluleEnTete(c.texte));
    // Un nombre de cellules different (2 colonnes, puis 3) ou un en-tete repete au milieu de la
    // grille = un autre tableau.
    if (serie.length > 0 && (colonnes !== bloc.length || enTete)) vider();
    colonnes = bloc.length;
    serie.push({ enTete, cellules });
  }
  vider();
  return noeuds;
}

/**
 * Dans les annexes, la premiere cellule est la categorie (« I. - Assemblée générale »),
 * repetee sur chaque ligne par le classeur : on la dessine une fois, sur toute sa portee,
 * comme le modele du cabinet. Une grille tarifaire n'a jamais deux lignes de meme libelle.
 */
function fusionnerCategories(lignes: LigneTableau[]): LigneTableau[] {
  if (lignes.some((l) => l.cellules.length < 2)) return lignes;
  let i = 0;
  while (i < lignes.length) {
    const tete = lignes[i]!;
    let j = i + 1;
    while (j < lignes.length && !lignes[j]!.enTete && !tete.enTete && lignes[j]!.cellules[0]!.texte === tete.cellules[0]!.texte) j++;
    if (j - i > 1) {
      tete.cellules[0] = { ...tete.cellules[0]!, portee: j - i };
      for (let k = i + 1; k < j; k++) lignes[k]!.cellules[0] = { ...lignes[k]!.cellules[0]!, fusionnee: true };
    }
    i = j;
  }
  return lignes;
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
