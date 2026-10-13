// Port d'extraction du texte d'un PDF (sans OCR). Sert au tri a deduire une copro depuis
// une facture ou un bon d'intervention. Ne depend de rien.

export interface ExtracteurPdf {
  /** Texte des premieres pages d'un PDF ; "" si illisible ou scanne (pas de couche texte). */
  texte(octets: Uint8Array, maxPages?: number): Promise<string>;
}
