// Port sortant : le dossier SharePoint de dépôt des factures pour BPO (02/11/2026, domain/depot-bpo).
// Lire l'arborescence datée (Compta/<agence>/<année>/<mois>/<JJ-MM>/<initiales>) et y déposer une
// pièce jointe, SANS JAMAIS créer de dossier : la compta les crée à l'avance. Ne dépend de rien.

import type { ResultatDepot } from "./depot-document-provider";

export type { ResultatDepot };

export interface DepotBpoProvider {
  /** false : l'écriture est coupée (droit SharePoint pas encore accordé) ; la lecture reste. */
  readonly ecritureActive: boolean;
  /**
   * Les noms des sous-dossiers de `chemin` (depuis la racine de la bibliothèque), les fichiers
   * écartés. null : le chemin n'existe pas. Lève si SharePoint est illisible.
   */
  listerDossiers(chemin: string[]): Promise<string[] | null>;
  /**
   * Dépose un fichier dans le dossier `chemin`, qui DOIT exister (jamais créé, même en route) ;
   * un fichier du même nom n'est jamais écrasé (le nouveau est renommé). Ne lève pas.
   */
  deposer(p: { chemin: string[]; nomFichier: string; contenu: Buffer; contentType: string }): Promise<ResultatDepot>;
}
