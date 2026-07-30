// Adapter pdfjs du port de lecture de texte. Reutilise extraireTextePages (deja en place
// pour la compta) : aucune nouvelle dependance.
//
// Degrade en chaine VIDE sur toute erreur (PDF chiffre, corrompu, sans couche texte) : un
// document illisible est un SCAN du point de vue de l'indexation, pas un plantage du
// pipeline. Le nom de fichier reprend alors son role d'indice faible.

import type { LecteurTexteProvider } from "@/lib/reprise/ports/lecteur-texte-provider";
import { extraireTextePages } from "@/lib/reprise/adapters/shared/pdf-texte";

/** Pages lues par defaut : la garde + les premiers en-tetes de tableaux suffisent. */
const PAGES_DEFAUT = 3;

export class LecteurTextePdfjs implements LecteurTexteProvider {
  async lireTexte(contenu: Uint8Array, pages = PAGES_DEFAUT): Promise<string> {
    try {
      const toutes = await extraireTextePages(contenu);
      return toutes
        .slice(0, pages)
        .flatMap((p) => p.lignes.flatMap((l) => l.items.map((i) => i.chaine)))
        .join(" ");
    } catch {
      return "";
    }
  }
}
