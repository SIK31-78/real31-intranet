// Port : rendre l'ODJ du CS en Word (.docx) depuis le gabarit du cabinet.
// Une seule implementation aujourd'hui (docxtemplater) ; le port isole les services de la
// bibliotheque et du chemin du gabarit, comme pour tout adapter (ADR-001).

import type { DonneesOdjCsDocx } from "@/lib/domain/odj-docx";

export interface OdjCsDocxRenderer {
  /** Le .docx rempli, pret a etre telecharge. Leve si une balise du gabarit est inconnue. */
  rendre(donnees: DonneesOdjCsDocx): Promise<Buffer>;
}
