// Le contrat de syndic en PDF : l'arbre du gabarit dessine en HTML A4, puis Chromium. Sert
// au telechargement (« Télécharger le contrat (PDF) ») et a la piece jointe de l'offre.

import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChampsContrat } from "@/lib/domain/contrat/champs-contrat";
import { estAslOuAful } from "@/lib/domain/copropriete";
import { htmlContrat } from "@/lib/domain/contrat/html-contrat";
import { cssPolicesPdf } from "@/lib/services/pdf/polices";
import { rendrePdf } from "@/lib/services/pdf/rendre-pdf";

let bandeau: Promise<string | undefined> | null = null;

/** Le bandeau du contrat (logo, motif, FNAIM, 20 ans — l'image du classeur) en data: URI, lu une fois par instance. */
function bandeauDataUri(): Promise<string | undefined> {
  if (!bandeau) {
    bandeau = readFile(join(process.cwd(), "public", "contrat-bandeau.png"))
      .then((b) => `data:image/png;base64,${b.toString("base64")}`)
      .catch(() => undefined);
  }
  return bandeau;
}

export async function pdfContrat(champs: ChampsContrat): Promise<Buffer> {
  const [bandeau, polices] = await Promise.all([bandeauDataUri(), cssPolicesPdf()]);
  return rendrePdf(htmlContrat(champs, bandeau, polices));
}

/** Nom de fichier du PDF : « Contrat de syndic - 16 rue Sébastopol - 2026-11-20.pdf ». */
export function nomFichierContrat(champs: ChampsContrat): string {
  const sujet = (champs.copro.code || champs.copro.nom || "copropriete").replace(/[\\/:*?"<>|]+/g, " ").trim();
  const nature = estAslOuAful(champs.copro.formeJuridique) ? "Contrat de mandat" : "Contrat de syndic";
  return `${nature} - ${sujet} - ${champs.dateAgISO}.pdf`;
}
