// Port : OCR d'une page de PDF, rendu en TOKENS avec géométrie et confiance.
//
// CE QU'ON DEMANDE À UN OCR, ET RIEN DE PLUS. Pas la reconstruction de structure de tableau :
// on l'a déjà (`parseur-grand-livre-positions`, `parseur-tantiemes-positions`). Ce qu'on veut,
// c'est du BRUT avec deux choses sans lesquelles rien ne distingue « lu » d'« inventé » :
//   - une CONFIANCE par token, pour que le code puisse REFUSER au lieu de deviner ;
//   - une GÉOMÉTRIE (bbox), pour reconstruire les colonnes par positions.
// C'est le critère de refusabilité de l'étude (§3) — et c'est pour ça que Tesseract suffit là
// où un service de « table extraction » facturerait la brique qu'on a écrite.
//
// OBLIGATION DE CONTRAT, PAS UNE LIGNE DE CODE À RELIRE. Toute implémentation DOIT honorer la
// métadonnée `/Rotate` de la page. Avec pdfjs : `page.getViewport({ scale, rotation:
// page.rotate })`. Ce n'est pas un détail : `RCP 2.pdf` de S0306 porte `/Rotate 180` sur ses
// 36 pages sur 36, et une mesure faite sans ce redressement rend **zéro** cellule là où la
// page redressée en rend 40. Une chaîne qui perd une métadonnée de page produit un chiffre
// qui ne mesure rien.
//
// TEST D'ACCEPTATION DU PORT (une minute à écrire, ferme le sujet) : OCRiser `RCP 2.pdf`
// p. 30 et vérifier que le premier mot lu est « TABLEAU » — et non son miroir « TIALYAV.L ».

/** Un token lu, avec sa boîte englobante dans l'image rendue. */
export interface TokenOcrPositionne {
  texte: string;
  /** Confiance 0-100 rendue par le moteur. */
  confiance: number;
  /** Bbox en pixels de l'image rendue, origine en haut à gauche. */
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

export interface PageOcr {
  /** Index de page, 1-based. */
  page: number;
  /** Rotation appliquée au rendu, telle que lue dans le PDF (0, 90, 180, 270). */
  rotationAppliquee: number;
  /** Résolution du rendu, en points par pouce. */
  dpi: number;
  tokens: TokenOcrPositionne[];
}

export interface OcrProvider {
  /**
   * OCRise les pages demandées d'un PDF.
   *
   * @param pdf      octets du PDF
   * @param pages    index 1-based ; vide = toutes
   * @param dpi      résolution de rendu. **300 est le point de fonctionnement mesuré** sur les
   *                 scans notariés de S0306 : la courbe est plate entre 200 et 400 dpi
   *                 (39, 40, 41 cellules sur 50), donc aucun intérêt à monter — et **aucun
   *                 upscaling** (le pic apparent à x2 Lanczos était du bruit sur une image
   *                 renversée, pas un optimum).
   *
   * L'implémentation DOIT renseigner `rotationAppliquee` avec la valeur réellement utilisée :
   * c'est ce champ qui rend la correction de la chaîne PROUVABLE au lieu d'être supposée.
   */
  ocriser(pdf: Uint8Array, pages: readonly number[], dpi?: number): Promise<PageOcr[]>;
}

/** Résolution de rendu par défaut : le point de fonctionnement mesuré (cf. `ocriser`). */
export const DPI_DEFAUT = 300;
