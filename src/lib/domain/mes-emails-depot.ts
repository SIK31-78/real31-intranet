// Racine SharePoint d'une copropriété, depuis le lien connu de son dossier d'AG. Pur : aucune
// dépendance, testable tel quel.
//
// Le dépôt d'une pièce jointe reçue par mail (bon d'intervention, facture), seul usage
// d'origine de ce fichier, a été retiré le 27/10/2026 (REA-423). Reste cette fonction, dont se
// sert le dépôt des documents de Contrats & contrôles (services/contrats-copro/documents.ts).
//
// Le lien connu d'une copro (Copropriete.sharepointUrl) est son dossier d'AG :
// « …/sites/copro/HLS/S247 - … SDC LE CYRANO/AG ». La racine de la copro = ce lien sans /AG.

/** Dossier racine de la copro, depuis son lien de dossier d'AG (on retire le dernier « /AG »). */
export function dossierCoproDepuisLienAg(lienAg: string): string {
  return lienAg.trim().replace(/\/+$/, "").replace(/\/AG$/i, "");
}
