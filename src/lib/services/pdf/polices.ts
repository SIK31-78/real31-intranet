// Les polices du PDF : Aptos (celle du classeur MYTHEC et d'Office), embarquee dans l'HTML
// en data: URI parce que Chromium sur Vercel n'a pas les polices du poste. Fichiers copies
// du cache Office du PC de Sekou (decision du 17/09/2026) ; jamais servis au public, lus
// une fois par instance.

import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const DOSSIER = join(process.cwd(), "src", "lib", "services", "pdf", "polices");

const FACES = [
  { fichier: "aptos-regular.ttf", poids: 400, style: "normal" },
  { fichier: "aptos-bold.ttf", poids: 700, style: "normal" },
  { fichier: "aptos-italic.ttf", poids: 400, style: "italic" },
  { fichier: "aptos-bold-italic.ttf", poids: 700, style: "italic" },
] as const;

let css: Promise<string> | null = null;

/** Les regles @font-face d'Aptos ; une chaine vide si les fichiers manquent (le PDF sort en police de secours). */
export function cssPolicesPdf(): Promise<string> {
  if (!css) {
    css = Promise.all(
      FACES.map(async (f) => {
        try {
          const b = await readFile(join(DOSSIER, f.fichier));
          return `@font-face { font-family: "Aptos"; font-weight: ${f.poids}; font-style: ${f.style}; src: url(data:font/ttf;base64,${b.toString("base64")}) format("truetype"); }`;
        } catch {
          return "";
        }
      }),
    ).then((regles) => regles.join("\n"));
  }
  return css;
}
