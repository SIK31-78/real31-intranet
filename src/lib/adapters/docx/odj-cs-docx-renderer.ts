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
    return archivePropre(gabarit, doc.getZip());
  }
}

/**
 * Word refuse une archive OOXML qui contient des ENTREES DE DOSSIER ("word/", "docProps/")
 * ou dont [Content_Types].xml n'est pas en tete - et PizZip en ajoute a la generation
 * (constate le 2026-09-22 : "Word a rencontre une erreur lors de l'ouverture du fichier",
 * 39 entrees au lieu de 37). On reconstruit donc l'archive de sortie a l'identique du
 * gabarit : memes entrees, meme ordre, aucun dossier.
 */
function archivePropre(gabarit: Buffer, rendu: PizZip): Buffer {
  const ordre = Object.keys(new PizZip(gabarit).files);
  const propre = new PizZip();
  for (const nom of ordre) {
    const entree = rendu.files[nom];
    if (!entree || entree.dir) continue;
    propre.file(nom, entree.asNodeBuffer(), { createFolders: false });
  }
  return propre.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
