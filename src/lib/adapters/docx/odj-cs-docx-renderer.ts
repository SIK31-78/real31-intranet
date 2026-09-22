// Adapter docxtemplater : remplit le gabarit Word de l'ODJ du CS.
//
// Le gabarit est le modele du cabinet (docs/Modele ODJ.dotx) balise une fois pour toutes
// (44 balises, cf. domain/odj-docx). Il est lu par chemin : sur Vercel il doit etre trace
// (next.config outputFileTracingIncludes sur la route qui le sert), sinon la fonction
// serverless ne l'embarque pas et le rendu echoue avec ENOENT.

import { readFile } from "node:fs/promises";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import type { DonneesOdjCsDocx } from "@/lib/domain/odj-docx";
import type { OdjCsDocxRenderer } from "@/lib/ports/odj-cs-docx-renderer";

const CHEMIN_GABARIT = path.join(process.cwd(), "src/lib/adapters/docx/gabarits/odj-cs.docx");

export class DocxtemplaterOdjCsRenderer implements OdjCsDocxRenderer {
  async rendre(donnees: DonneesOdjCsDocx): Promise<Buffer> {
    const gabarit = await readFile(CHEMIN_GABARIT);
    const zip = new PizZip(gabarit);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      // Une balise absente des donnees rend "" (un blanc), jamais "undefined" dans le Word.
      nullGetter: () => "",
    });
    doc.render(donnees);
    return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
  }
}
