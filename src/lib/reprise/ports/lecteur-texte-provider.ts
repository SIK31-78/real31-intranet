// Port : lecture de la COUCHE TEXTE d'un document. Abstrait pdfjs pour que l'INDEXATION
// (domain/indexation-documents) puisse decider sur le CONTENU sans que le service connaisse
// un adapter (ADR-001).
//
// Volontairement minimal : l'indexation n'a besoin que du texte des PREMIERES pages (les
// en-tetes de tableaux et la page de garde suffisent a poser les apports). Pas de geometrie
// ici : la transcription par positions, elle, passe par les parseurs dedies.

export interface LecteurTexteProvider {
  /**
   * Texte des `pages` premieres pages du document, concatene. Chaine VIDE si le PDF n'a pas
   * de couche texte exploitable (scan) : c'est un resultat, pas une erreur -- l'indexation
   * en deduit `forme: "scan"` et retombe sur les indices de nom.
   */
  lireTexte(contenu: Uint8Array, pages?: number): Promise<string>;
}
