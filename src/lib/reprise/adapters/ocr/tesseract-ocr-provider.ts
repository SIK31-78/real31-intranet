// Adapter tout-npm du port OcrProvider : pdfjs (rendu) + @napi-rs/canvas (raster) +
// tesseract.js (OCR WASM). Étape 6 du chantier extraction.
//
// POURQUOI TOUT-NPM ET PAS DES BINAIRES SYSTÈME. Le module reprise est LOCAL par conception
// (décision Sekou 2026-07-30) : il tourne sur N postes Windows. Le problème n'est donc pas le
// serverless mais la REPRODUCTIBILITÉ entre postes — et il vaut pour Tesseract autant que pour
// le rastériseur, tous deux binaires système.
//
// Mesure qui a tranché : sur ce poste, le binaire Tesseract et tesseract.js n'utilisent PAS les
// mêmes modèles (`eng` 4 113 088 o contre 5 199 098 o ; `fra` 14 213 351 o contre 1 248 107 o —
// variantes tessdata / best / fast mélangées). « Tesseract » n'est pas un moteur, c'est une
// famille. La chaîne npm embarque ses modèles ET son moteur : elle voyage avec l'app. La chaîne
// système dépend de ce qu'un installeur a déposé sur chaque poste.
// Coût mesuré de ce choix : 457 ms contre 397 ms par page, soit 1,15x — pas les 2 à 5x redoutés.
//
// OBLIGATION HONORÉE ICI : `/Rotate` est lu PAR PAGE (`page.rotate`) et passé au viewport.
// Ce n'est pas une propriété du document — la convocation de S0306 porte trois valeurs
// différentes dont huit pages à 90°.

import { createWorker, PSM, type Worker } from "tesseract.js";
import {
  DPI_DEFAUT,
  type OcrProvider,
  type PageOcr,
  type ProvenanceOcr,
  type ResultatOcr,
  type TokenOcrPositionne,
} from "@/lib/reprise/ports/ocr-provider";

/** 72 points par pouce : le facteur d'échelle d'un rendu pdfjs se calcule depuis là. */
const POINTS_PAR_POUCE = 72;

/** Langue par défaut. `fra` est nécessaire aux libellés de lots et aux patronymes. */
const LANGUE_DEFAUT = "fra";

/** Colonnes du TSV de Tesseract (ordre imposé par le moteur). */
const TSV_CONF = 10;
const TSV_TEXTE = 11;
const TSV_LEFT = 6;
const TSV_TOP = 7;
const TSV_WIDTH = 8;
const TSV_HEIGHT = 9;

/**
 * Forme minimale du `NodeCanvasFactory` de pdfjs, que ses types publics déclarent seulement
 * comme `Object`. On ne redéclare que ce qu'on appelle : le canvas rendu expose `toBuffer`
 * (c'est un canvas @napi-rs), et le contexte est passé tel quel à `render`.
 */
interface FabriqueCanvasPdfjs {
  create(largeur: number, hauteur: number): {
    canvas: { toBuffer(mime: "image/png"): Buffer };
    context: unknown;
  };
}

/** Parse le TSV de Tesseract en tokens positionnés, en écartant les lignes non textuelles. */
function tokensDepuisTsv(tsv: string): TokenOcrPositionne[] {
  const tokens: TokenOcrPositionne[] = [];
  for (const ligne of tsv.split("\n").slice(1)) {
    const c = ligne.split("\t");
    const texte = (c[TSV_TEXTE] ?? "").trim();
    if (texte === "") continue;
    const conf = Number(c[TSV_CONF]);
    tokens.push({
      texte,
      confiance: Number.isFinite(conf) ? conf : -1,
      x: Number(c[TSV_LEFT]) || 0,
      y: Number(c[TSV_TOP]) || 0,
      largeur: Number(c[TSV_WIDTH]) || 0,
      hauteur: Number(c[TSV_HEIGHT]) || 0,
    });
  }
  return tokens;
}

/**
 * Charge pdfjs en build Node (`legacy/build/pdf.mjs`) : le build par défaut cible le
 * navigateur. `serverExternalPackages` est déjà posé pour pdfjs (piège Next déjà payé côté
 * couche texte, cf. adapters/shared/pdf-texte).
 */
async function chargerPdfjs() {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

export class TesseractOcrProvider implements OcrProvider {
  constructor(private readonly langue: string = LANGUE_DEFAUT) {}

  async ocriser(pdf: Uint8Array, pages: readonly number[], dpi = DPI_DEFAUT): Promise<ResultatOcr> {
    const pdfjs = await chargerPdfjs();
    // `data` doit être une copie : pdfjs transfère le buffer et le rend inutilisable ensuite.
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), isEvalSupported: false })
      .promise;

    const cibles = pages.length > 0 ? [...pages] : Array.from({ length: doc.numPages }, (_, i) => i + 1);
    // UN worker pour tout le lot : c'est ce qui ramène le coût à 1,15x du binaire système.
    // Créé une fois par appel, terminé dans le `finally` même en cas d'erreur.
    let worker: Worker | undefined;
    const resultats: PageOcr[] = [];
    try {
      worker = await createWorker(this.langue, 1, { logger: () => {} });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        // Sans ça, Tesseract suppose 70 dpi et le journalise en avertissement.
        user_defined_dpi: String(dpi),
      });

      for (const numero of cibles) {
        const page = await doc.getPage(numero);
        // LA ligne qui compte : la rotation vient de CETTE page, jamais du document.
        const rotation = page.rotate;
        const viewport = page.getViewport({ scale: dpi / POINTS_PAR_POUCE, rotation });
        // LE CANVAS EST CRÉÉ PAR PDFJS, PAS PAR NOUS. Son build Node embarque déjà un
        // `NodeCanvasFactory` adossé à @napi-rs/canvas. Fabriquer le canvas soi-même et lui
        // passer le contexte fait CRASHER le process au `render` — crash natif, sans exception
        // rattrapable (constaté le 30/07 : le worker vitest mourait sans message). On passe donc
        // par la fabrique du document, ce qui supprime au passage tout code de raster maison.
        const fabrique = doc.canvasFactory as unknown as FabriqueCanvasPdfjs;
        const { canvas, context } = fabrique.create(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height),
        );
        await page.render({ canvasContext: context as CanvasRenderingContext2D, viewport }).promise;

        const { data } = await worker.recognize(canvas.toBuffer("image/png"), {}, { tsv: true });
        resultats.push({
          page: numero,
          rotationAppliquee: rotation,
          dpi,
          tokens: tokensDepuisTsv(data.tsv ?? ""),
        });
        page.cleanup();
      }
    } finally {
      await worker?.terminate();
      await doc.destroy();
    }

    return { pages: resultats, provenance: await this.provenance(dpi) };
  }

  /** Provenance de la chaîne : ce qui rend une mesure reproductible ailleurs (§5). */
  private async provenance(dpi: number): Promise<ProvenanceOcr> {
    const [tesseract, pdfjsPkg] = await Promise.all([
      import("tesseract.js/package.json", { with: { type: "json" } }).catch(() => null),
      import("pdfjs-dist/package.json", { with: { type: "json" } }).catch(() => null),
    ]);
    return {
      moteur: `tesseract.js ${tesseract?.default?.version ?? "?"}`,
      langue: this.langue,
      // @napi-rs/canvas n'est pas appelé directement : c'est le NodeCanvasFactory de pdfjs qui
      // s'en sert. On le nomme quand même, c'est lui qui rastérise.
      rasteriseur: `pdfjs-dist ${pdfjsPkg?.default?.version ?? "?"} + @napi-rs/canvas`,
      segmentation: `psm ${PSM.SINGLE_BLOCK} (SINGLE_BLOCK), ${dpi} dpi`,
      // "aucun" est la valeur ATTENDUE : le pic apparent à x2 Lanczos relevé un temps était du
      // bruit sur une image renversée, pas un optimum. Pas d'upscaling dans cette chaîne.
      pretraitement: "aucun",
    };
  }
}
