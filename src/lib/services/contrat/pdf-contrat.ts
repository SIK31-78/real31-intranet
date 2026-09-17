// Le contrat de syndic en PDF : l'arbre du gabarit dessine en HTML A4, puis Chromium. Sert
// au telechargement (« Télécharger le contrat (PDF) ») et a la piece jointe de l'offre.

import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChampsContrat } from "@/lib/domain/contrat/champs-contrat";
import { htmlContrat } from "@/lib/domain/contrat/html-contrat";
import { rendrePdf } from "@/lib/services/pdf/rendre-pdf";

let logo: Promise<string | undefined> | null = null;

/** Le logo du cabinet en data: URI (public/logo-real31.png), lu une fois par instance. */
function logoDataUri(): Promise<string | undefined> {
  if (!logo) {
    logo = readFile(join(process.cwd(), "public", "logo-real31.png"))
      .then((b) => `data:image/png;base64,${b.toString("base64")}`)
      .catch(() => undefined);
  }
  return logo;
}

export async function pdfContrat(champs: ChampsContrat): Promise<Buffer> {
  return rendrePdf(htmlContrat(champs, await logoDataUri()));
}

/** Nom de fichier du PDF : « Contrat de syndic - 16 rue Sébastopol - 2026-11-20.pdf ». */
export function nomFichierContrat(champs: ChampsContrat): string {
  const sujet = (champs.copro.code || champs.copro.nom || "copropriete").replace(/[\\/:*?"<>|]+/g, " ").trim();
  return `Contrat de syndic - ${sujet} - ${champs.dateAgISO}.pdf`;
}
