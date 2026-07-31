// Pont OCR -> PageTexte : convertit des tokens positionnés (bbox + confiance) en la structure
// de lignes que consomment les parseurs par positions.
//
// C'EST LA PIECE QUI SORT LA STRUCTURATION DU MODELE. Jusqu'ici, la transcription était bien
// hors du modèle pour la compta (couche texte native), mais le PATRIMOINE de S0306 n'a que des
// SCANS — donc pas de couche texte — et l'OCR markdown repartait dans un appel de
// structuration. Résultat mesuré : une clé « ascenseur » sommant 11 067 alors que le maximum
// lisible depuis la source est 2 800 (la page 2 du tableau n'existe dans aucun PDF du lot).
// Un nombre qui ne peut pas venir du document vient forcément du modèle.
//
// Avec ce pont, la chaîne devient : OCR (tokens + bbox) -> lignes reconstruites par POSITIONS
// -> `parserTantiemesPositions` -> tantièmes. Aucun modèle entre l'image et le nombre.
//
// PIEGE D'ORIENTATION DES AXES, à ne pas se reprendre : l'OCR rend une origine EN HAUT à
// gauche (y croît vers le bas), pdfjs une origine EN BAS à gauche (y croît vers le haut). Les
// parseurs raisonnent en repère PDF — `ligne.y >= enteteY` y signifie « au-dessus de
// l'en-tête ». Sans inversion, le parseur lirait le tableau à l'envers et ne garderait que ce
// qui est AU-DESSUS de l'en-tête, c'est-à-dire rien.

import { reconstruireLignes, type ItemTexte, type PageTexte } from "@/lib/reprise/adapters/shared/pdf-texte";
import type { PageOcr, TokenOcrPositionne } from "@/lib/reprise/ports/ocr-provider";

/**
 * Confiance minimale pour qu'un token soit REPRIS. En dessous, la cellule est écartée : mieux
 * vaut un trou (que le bouclage détectera) qu'une valeur inventée.
 *
 * 30 est bas à dessein — la mesure sur les scans réels de S0306 donne 47,3 de moyenne sur une
 * page SAINE de 1975. Un seuil serré y retirerait des cellules justes, et le garde-fou
 * arithmétique est de toute façon le juge final.
 */
export const CONFIANCE_MIN_CELLULE = 30;

/** Un token OCR devient un item positionné, dans le repère PDF (y inversé). */
function versItem(t: TokenOcrPositionne, hauteurImage: number): ItemTexte {
  return {
    x: t.x,
    // Inversion de l'axe vertical : origine OCR en haut, origine PDF en bas.
    y: hauteurImage - t.y - t.hauteur,
    largeur: t.largeur,
    chaine: t.texte,
  };
}

/**
 * Convertit une page OCRisée en `PageTexte`, prête pour les parseurs par positions.
 *
 * `hauteurImage` se déduit des tokens eux-mêmes quand elle n'est pas fournie : seule la
 * COHERENCE du repère compte pour le groupement en lignes et la comparaison à l'en-tête.
 */
export function ocrVersPageTexte(
  page: PageOcr,
  options?: { confianceMin?: number; largeurImage?: number; hauteurImage?: number },
): PageTexte {
  const confianceMin = options?.confianceMin ?? CONFIANCE_MIN_CELLULE;
  const retenus = page.tokens.filter(
    (t) => t.texte.trim() !== "" && (t.confiance < 0 || t.confiance >= confianceMin),
  );
  const hauteur =
    options?.hauteurImage ?? retenus.reduce((m, t) => Math.max(m, t.y + t.hauteur), 0) + 1;
  const largeur = options?.largeurImage ?? retenus.reduce((m, t) => Math.max(m, t.x + t.largeur), 0) + 1;

  const items = retenus.map((t) => versItem(t, hauteur));
  const lignes = reconstruireLignes(items);
  return { largeur, hauteur, lignes, nbItems: items.length };
}

/** Combien de tokens une conversion a écartés pour confiance insuffisante (trace de mesure). */
export function cellulesEcartees(page: PageOcr, confianceMin = CONFIANCE_MIN_CELLULE): number {
  return page.tokens.filter(
    (t) => t.texte.trim() !== "" && t.confiance >= 0 && t.confiance < confianceMin,
  ).length;
}
