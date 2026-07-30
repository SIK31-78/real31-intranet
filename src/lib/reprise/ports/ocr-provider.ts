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
// métadonnée `/Rotate` **DE CHAQUE PAGE**. Avec pdfjs : `page.getViewport({ scale, rotation:
// page.rotate })`. Ce n'est pas un détail, et surtout ce n'est pas une propriété du document :
//
//   RCP.pdf       aucun /Rotate (28 p.)      RCP 2.pdf   180 partout (36 p.)
//   rgd.pdf       0 partout (6 p.)           FDP         0 partout (5 p.)
//   CONVOCATION   absent x36, 0 x43, 90 x8   <-- TROIS valeurs dans UN fichier
//
// Une mesure faite sans redressement rend **zéro** cellule là où la page redressée en rend 40.
// Une chaîne qui perd une métadonnée de page produit un chiffre qui ne mesure rien. Et les
// huit pages à 90° de la convocation interdisent de ne traiter que le cas 180.
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

/**
 * Provenance de la lecture : de quoi rendre une mesure REPRODUCTIBLE ailleurs.
 *
 * Nécessaire parce que le chemin OCR tourne EN LOCAL (phase 1) : la chaîne « figée » devient
 * dépendante de la machine. Sans ces champs, « chaîne figée » ne survit pas au premier
 * changement de poste, et on retombe exactement dans « deux personnes comparent en réalité
 * deux prétraitements ». Ils sont relevés dans le tableau de résultats du protocole §5.
 */
export interface ProvenanceOcr {
  /** Version du moteur OCR (ex. "tesseract 5.4.0"). */
  moteur: string;
  /** Pack de langue utilisé (ex. "eng", "fra"). Les libellés et patronymes exigent `fra`. */
  langue: string;
  /**
   * Empreinte du modèle de langue : taille en octets du `.traineddata` utilisé.
   *
   * MESURÉ le 30/07 et non supposé : « Tesseract » n'est pas un moteur, c'est une famille.
   * Sur ce poste, le binaire système et tesseract.js n'utilisent PAS les mêmes modèles —
   * `eng` fait 4 113 088 o d'un côté et 5 199 098 o de l'autre, `fra` 14 213 351 o contre
   * 1 248 107 o (variantes `tessdata` / `tessdata_best` / `tessdata_fast`). Sur la même
   * image, la même version majeure et le même `--psm`, l'un lit 20 cellules et l'autre 42.
   * Sans cette empreinte, deux mesures « Tesseract 5, psm 6, 300 dpi » restent incomparables.
   */
  tailleModeleOctets?: number;
  /** Version du rasteriseur (ex. "pdfjs-dist 4.10.38"). */
  rasteriseur: string;
  /** Mode de segmentation du moteur (ex. "--psm 6"). */
  segmentation: string;
  /** Post-traitement appliqué à l'image. "aucun" est la valeur attendue : pas d'upscaling. */
  pretraitement: string;
}

export interface PageOcr {
  /** Index de page, 1-based. */
  page: number;
  /**
   * Rotation RÉELLEMENT appliquée au rendu de CETTE page, telle que lue dans le PDF
   * (0, 90, 180, 270). C'est ce champ qui rend la correction de la chaîne PROUVABLE au lieu
   * d'être supposée : le protocole §5 le relève page par page.
   */
  rotationAppliquee: number;
  /** Résolution du rendu, en points par pouce. */
  dpi: number;
  tokens: TokenOcrPositionne[];
}

export interface ResultatOcr {
  pages: PageOcr[];
  provenance: ProvenanceOcr;
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
  ocriser(pdf: Uint8Array, pages: readonly number[], dpi?: number): Promise<ResultatOcr>;
}

/** Résolution de rendu par défaut : le point de fonctionnement mesuré (cf. `ocriser`). */
export const DPI_DEFAUT = 300;
