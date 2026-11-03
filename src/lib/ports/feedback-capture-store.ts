// Port : captures d'ecran jointes aux remontees (REA-255). Fichiers binaires, hors de la
// table intranet_feedback : un dossier par remontee dans un stockage de fichiers.

export interface CaptureStockee {
  chemin: string;
  contentType: string;
  contenu: Uint8Array;
}

export interface FeedbackCaptureStore {
  /** Depose une capture (chemin stable, ecrase si deja present). */
  televerser(chemin: string, contenu: Uint8Array, contentType: string): Promise<void>;
  /** Captures d'une remontee, contenu compris. [] si aucune ou stockage injoignable. */
  lirePourRemontee(feedbackId: string): Promise<CaptureStockee[]>;
}
