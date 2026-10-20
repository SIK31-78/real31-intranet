// Deduire une copro du TEXTE des pieces jointes PDF d'un mail (facture, bon d'intervention),
// quand le mail lui-meme ne donne pas de piste claire (ADR-046, mesure du 13/10/2026). LECTURE
// SEULE, sans OCR, sans IA : on extrait le texte, on retire l'en-tete du cabinet, on passe le
// meme moteur que le mail. Toujours a confirmer par un clic.

import { coprosDansPdf } from "@/lib/domain/tri-emails";
import type { PieceJointeRef } from "@/lib/domain/mes-emails";
import { getExtracteurPdf, getReferentielTriProvider } from "@/lib/adapters/router";
import { listerPiecesJointesTri, lirePieceJointeTri } from "./pieces-jointes";
import { signalerException } from "@/lib/observabilite";

export interface CoproDepuisPj {
  /** References candidates (la plus probable d'abord). */
  candidats: string[];
  /** Nom de la piece jointe d'ou vient la deduction. */
  piece: string;
}

const MAX_PDF = 5;
const estPdf = (p: PieceJointeRef) => /\.pdf$/i.test(p.nom) || /pdf/i.test(p.type);

export async function coproDepuisPiecesJointes(internetMessageId: string): Promise<CoproDepuisPj | null> {
  const pdfs = (await listerPiecesJointesTri(internetMessageId)).filter(estPdf).slice(0, MAX_PDF);
  if (pdfs.length === 0) return null;

  const [{ copros }, extracteur] = [await getReferentielTriProvider().charger(), getExtracteurPdf()];
  for (const pj of pdfs) {
    let texte = "";
    try {
      const { base64 } = await lirePieceJointeTri(internetMessageId, pj.id);
      texte = await extracteur.texte(Uint8Array.from(Buffer.from(base64, "base64")));
    } catch (e) {
      // PDF illisible : on passe au suivant, mais on le signale. Avalée sans bruit, une panne
      // de l'extracteur en prod est passée inaperçue (19-20/10/2026).
      signalerException(e, { source: "tri-emails-pj", detail: { piece: pj.nom } });
      continue;
    }
    if (texte.replace(/\s/g, "").length < 40) continue; // scanne / sans couche texte.
    const candidats = coprosDansPdf(texte, copros);
    if (candidats.length > 0) return { candidats, piece: pj.nom };
  }
  return null;
}
