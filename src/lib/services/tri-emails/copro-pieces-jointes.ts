// Deduire une copro du TEXTE des pieces jointes PDF d'un mail (facture, bon d'intervention),
// quand le mail lui-meme ne donne pas de piste claire (ADR-046, mesure du 13/10/2026). LECTURE
// SEULE, sans OCR, sans IA : on extrait le texte, on retire l'en-tete du cabinet, on passe le
// meme moteur que le mail. A l'ecran, toujours a confirmer par un clic ; la tache planifiee
// range seule quand les PDF ne designent qu'une copro (coprosDeTousLesPdf, 26/10/2026).

import { coprosDansPdf, type CoproTri } from "@/lib/domain/tri-emails";
import type { PieceJointeRef } from "@/lib/domain/mes-emails";
import type { ExtracteurPdf } from "@/lib/ports/extracteur-pdf";
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
/**
 * Au-dela, le PDF n'est pas lu (27/10/2026) : Graph le rend en base64 et pdfjs le decode
 * entierement en memoire, dans la fonction du cron (60 s, memoire bornee) a cote des autres
 * lectures du passage. Un plan ou un rapport scanne de 20 Mo n'a de toute facon pas de texte.
 */
const TAILLE_MAX_PDF = 5 * 1024 * 1024;
const estPdf = (p: PieceJointeRef) => /\.pdf$/i.test(p.nom) || /pdf/i.test(p.type);

async function pdfsDuMail(internetMessageId: string): Promise<PieceJointeRef[]> {
  return (await listerPiecesJointesTri(internetMessageId))
    .filter((p) => estPdf(p) && p.taille <= TAILLE_MAX_PDF)
    .slice(0, MAX_PDF);
}

/** Le texte d'un PDF, ou null s'il est illisible ou scanne (sans couche texte). */
async function texteDuPdf(internetMessageId: string, pj: PieceJointeRef, extracteur: ExtracteurPdf): Promise<string | null> {
  let texte = "";
  try {
    const { base64 } = await lirePieceJointeTri(internetMessageId, pj.id);
    texte = await extracteur.texte(Uint8Array.from(Buffer.from(base64, "base64")));
  } catch (e) {
    // PDF illisible : on passe au suivant, mais on le signale. Avalée sans bruit, une panne
    // de l'extracteur en prod est passée inaperçue (19-20/10/2026).
    signalerException(e, { source: "tri-emails-pj", detail: { piece: pj.nom } });
    return null;
  }
  return texte.replace(/\s/g, "").length < 40 ? null : texte;
}

export async function coproDepuisPiecesJointes(internetMessageId: string): Promise<CoproDepuisPj | null> {
  const pdfs = await pdfsDuMail(internetMessageId);
  if (pdfs.length === 0) return null;

  const [{ copros }, extracteur] = [await getReferentielTriProvider().charger(), getExtracteurPdf()];
  for (const pj of pdfs) {
    const texte = await texteDuPdf(internetMessageId, pj, extracteur);
    if (texte === null) continue;
    const candidats = coprosDansPdf(texte, copros);
    if (candidats.length > 0) return { candidats, piece: pj.nom };
  }
  return null;
}

/**
 * Pour la tache planifiee (ranger-auto.ts) : les copros designees par TOUS les PDF du mail
 * (5 au plus), leur union. La premiere piste trouvee ne suffit pas ici : un second PDF peut
 * viser une autre copro, et l'automatique exige qu'il n'y en ait qu'une. Le referentiel est
 * celui du passage (pas de rechargement).
 */
export async function coprosDeTousLesPdf(internetMessageId: string, copros: CoproTri[]): Promise<string[]> {
  const pdfs = await pdfsDuMail(internetMessageId);
  const candidats: string[] = [];
  if (pdfs.length === 0) return candidats;
  const extracteur = getExtracteurPdf();
  for (const pj of pdfs) {
    const texte = await texteDuPdf(internetMessageId, pj, extracteur);
    if (texte === null) continue;
    for (const r of coprosDansPdf(texte, copros)) if (!candidats.includes(r)) candidats.push(r);
  }
  return candidats;
}
