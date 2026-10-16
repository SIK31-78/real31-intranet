// Port sortant : déposer un document dans un dossier de copropriété (SharePoint). En réel,
// Graph (Sites.Selected, écriture sur le seul site « copro ») ; sinon un adaptateur inactif.
// Ne dépend de rien.

export type ResultatDepot =
  /** `driveId` / `itemId` : identifiants Graph du fichier, quand l'adapter sait les rendre
   *  (pointeurs de documents du module Contrats & contrôles). */
  | { depose: true; webUrl: string; driveId?: string; itemId?: string }
  | { depose: false; raison: string };

export interface DepotDocumentProvider {
  /** false quand le dépôt est coupé (pas de droit SharePoint) : l'appelant ne tente rien. */
  readonly actif: boolean;
  /**
   * Dépose `contenu` sous `<dossierUrl>/<sousDossiers…>/<nomFichier>`. Les sous-dossiers
   * manquants sont créés, un fichier du même nom est remplacé (la dernière édition fait foi).
   * Ne lève pas : un échec revient en `raison`, lisible par l'utilisateur.
   * `contentType` : type MIME du fichier (PDF par défaut).
   */
  deposer(p: { dossierUrl: string; sousDossiers: string[]; nomFichier: string; contenu: Buffer; contentType?: string }): Promise<ResultatDepot>;
}
