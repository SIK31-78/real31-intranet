// Port sortant : déposer un document dans un dossier de copropriété (SharePoint). En réel,
// Graph (Sites.Selected, écriture sur le seul site « copro ») ; sinon un adaptateur inactif.
// Ne dépend de rien.

export type ResultatDepot =
  /** `driveId` / `itemId` : identifiants Graph du fichier, quand l'adapter sait les rendre
   *  (pointeurs de documents du module Contrats & contrôles). `nom` : le nom RÉEL du fichier
   *  déposé, qui peut différer du nom demandé quand le conflit se règle en renommant. */
  | { depose: true; webUrl: string; driveId?: string; itemId?: string; nom?: string }
  | { depose: false; raison: string };

/**
 * Que faire quand un fichier du même nom existe déjà :
 *   - "remplacer" (défaut) : la dernière édition fait foi (contrat de syndic régénéré) ;
 *   - "renommer" : le nouveau fichier reçoit un suffixe, l'existant n'est jamais écrasé
 *     (documents de contrats : deux pièces déposées le même jour ne doivent pas se manger).
 */
export type ConflitDepot = "remplacer" | "renommer";

export interface DepotDocumentProvider {
  /** false quand le dépôt est coupé (pas de droit SharePoint) : l'appelant ne tente rien. */
  readonly actif: boolean;
  /**
   * Dépose `contenu` sous `<dossierUrl>/<sousDossiers…>/<nomFichier>`. Les sous-dossiers
   * manquants sont créés ; un fichier du même nom est remplacé ou renommé selon `conflit`
   * (remplacé par défaut). Ne lève pas : un échec revient en `raison`, lisible par
   * l'utilisateur. `contentType` : type MIME du fichier (PDF par défaut).
   */
  deposer(p: { dossierUrl: string; sousDossiers: string[]; nomFichier: string; contenu: Buffer; contentType?: string; conflit?: ConflitDepot }): Promise<ResultatDepot>;
}
