// Port : rendre en Word l'ODJ du CS **tel qu'il a ete rempli en ligne** (REA-132).
//
// A ne pas confondre avec `OdjCsDocxRenderer`, qui remplit le GABARIT du cabinet et laisse
// des blancs (la voie "je remplis en reunion dans Word", REA-62). Ici il n'y a pas de
// gabarit : le document est dessine de bout en bout depuis l'arbre de rendu, pour que tout
// ce que le module en ligne permet (paragraphes libres, notes ancrees, champs ajoutes)
// arrive dans le fichier.

import type { ArbreOdj } from "@/lib/domain/odj-rendu";

export interface OptionsRenduOdjRempli {
  /** Le logo REAL31 en PNG, pour l'en-tete de marque. Absent = en-tete sans image. */
  logo?: Buffer;
}

export interface OdjRempliDocxRenderer {
  /** Le .docx complet, pret a etre telecharge. */
  rendre(arbre: ArbreOdj, options?: OptionsRenduOdjRempli): Promise<Buffer>;
}
