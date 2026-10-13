// Extraction du texte d'un PDF avec pdfjs-dist (build legacy, compatible Node/serverless),
// sans OCR : un PDF scanne rend un texte vide, c'est au service de le constater. On se limite
// aux premieres pages (l'adresse du chantier est en tete d'une facture ou d'un bon).

import type { ExtracteurPdf } from "@/lib/ports/extracteur-pdf";

export class PdfjsExtracteur implements ExtracteurPdf {
  async texte(octets: Uint8Array, maxPages = 3): Promise<string> {
    // Import dynamique : pdfjs ne doit pas alourdir les bundles qui ne lisent pas de PDF.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({
      data: octets,
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true,
    }).promise;
    try {
      const pages: string[] = [];
      for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
        const page = await doc.getPage(i);
        const contenu = await page.getTextContent();
        // On reconstruit les LIGNES (hasEOL) : le domaine retire les lignes du papier a
        // en-tete du cabinet ; une page aplatie en une ligne serait jetee en entier,
        // adresse du chantier comprise (bug vu le 13/10 : pdftotext gardait les lignes).
        pages.push(contenu.items.map((x) => ("str" in x ? x.str + (x.hasEOL ? "\n" : " ") : "")).join(""));
        page.cleanup();
      }
      return pages.join("\n");
    } finally {
      await doc.destroy();
    }
  }
}
