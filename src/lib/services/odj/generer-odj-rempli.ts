// Service : l'ODJ du CS **tel qu'il a ete rempli en ligne**, en Word et en PDF (REA-132).
//
// Un collegue prepare l'ODJ dans le module en ligne (champs, lignes masquees, paragraphes
// libres, notes ancrees), puis veut le telecharger AVEC tout ce qu'il a saisi, pour
// l'envoyer au CS ou l'imprimer. Le Word existant (generer-odj-cs-docx) repond a l'autre
// besoin : le modele du cabinet PRE-REMPLI, qu'on finit de remplir en reunion. Les deux
// voies ont ete gardees au point du 01/10/2026 ; ce service rend la voie en ligne exportable.
//
// Meme perimetre de lecture que l'ecran /odj/<id> (`transverse: true`) : un collegue qui
// consulte l'ODJ d'un confrere peut le telecharger, comme il peut l'imprimer.

import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getOdjRempliDocxRenderer } from "@/lib/adapters/router";
import { arbreOdj, nomFichierOdjRempli } from "@/lib/domain/odj-rendu";
import { htmlOdj } from "@/lib/domain/odj-html";
import { cssPolicesPdf } from "@/lib/services/pdf/polices";
import { rendrePdf } from "@/lib/services/pdf/rendre-pdf";
import { getOdj } from "./get-odj";

export interface FichierOdjRempli {
  contenu: Buffer;
  nomFichier: string;
}

let logo: Promise<Buffer | undefined> | null = null;

/** Le logo REAL31, lu une fois par instance. Absent = document sans en-tete image, jamais
 *  une erreur : un ODJ sans logo reste un ODJ lisible. */
function logoReal31(): Promise<Buffer | undefined> {
  if (!logo) {
    logo = readFile(join(process.cwd(), "public", "logo-real31.png")).catch(() => undefined);
  }
  return logo;
}

/** Le .docx de l'ODJ rempli. `null` = copropriete (ou ODJ) introuvable pour ce gestionnaire. */
export async function genererOdjRempliDocx(idOdj: string, gestionnaireId: string): Promise<FichierOdjRempli | null> {
  const odj = await getOdj(idOdj, gestionnaireId, { transverse: true });
  if (!odj) return null;
  const image = await logoReal31();
  const contenu = await getOdjRempliDocxRenderer().rendre(arbreOdj(odj), {
    ...(image ? { logo: image } : {}),
  });
  return { contenu, nomFichier: `${nomFichierOdjRempli(odj)}.docx` };
}

/** Le PDF du MEME document : l'arbre dessine en HTML A4, puis Chromium (ADR-012 v3). Sert au
 *  telechargement et, demain, a la piece jointe du mail au CS (REA-146). */
export async function genererOdjRempliPdf(idOdj: string, gestionnaireId: string): Promise<FichierOdjRempli | null> {
  const odj = await getOdj(idOdj, gestionnaireId, { transverse: true });
  if (!odj) return null;
  const [image, polices] = await Promise.all([logoReal31(), cssPolicesPdf()]);
  const dataUri = image ? `data:image/png;base64,${image.toString("base64")}` : undefined;
  const contenu = await rendrePdf(htmlOdj(arbreOdj(odj), dataUri, polices));
  return { contenu, nomFichier: `${nomFichierOdjRempli(odj)}.pdf` };
}
