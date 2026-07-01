// Detection de couche texte d'un PDF (librairie locale unpdf, PAS un moteur OCR).
// But : decider si un PDF a une couche texte exploitable (natif) ou s'il est scanne.
// - natif  -> on passe le texte extrait au modele (tokens texte, moins cher)
// - scanne -> on passe le PDF en image/document au modele qui OCR-ise (vision)
// Strategie fidele a la procedure vault : "teste la couche texte, OCR seulement si scanne".

import { extractText, getDocumentProxy } from "unpdf";

export interface AnalysePdf {
  /** true si couche texte exploitable (>= SEUIL car/page). */
  natif: boolean;
  nbPages: number;
  carParPage: number;
  /** Texte extrait (utilisable directement si natif). */
  texte: string;
}

const SEUIL_CAR_PAGE = 100;

export async function detecterCoucheTexte(contenu: Uint8Array): Promise<AnalysePdf> {
  const pdf = await getDocumentProxy(contenu);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const texte = Array.isArray(text) ? text.join("\n") : text;
  const carUtiles = texte.replace(/\s/g, "").length;
  const carParPage = totalPages > 0 ? carUtiles / totalPages : 0;
  return { natif: carParPage >= SEUIL_CAR_PAGE, nbPages: totalPages, carParPage, texte };
}
