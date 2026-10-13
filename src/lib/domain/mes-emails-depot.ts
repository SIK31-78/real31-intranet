// Où ranger, sur SharePoint, une pièce jointe reçue par mail (bon d'intervention, facture…).
// Demande de Sekou (13/10/2026) : « je reçois un bon d'intervention, on me propose de le
// mettre directement sur le Drive ». Pur : aucune dépendance, testable tel quel.
//
// Le lien connu d'une copro (Copropriete.sharepointUrl) est son dossier d'AG :
// « …/sites/copro/HLS/S247 - … SDC LE CYRANO/AG ». La racine de la copro = ce lien sans /AG.
// Le sous-dossier cible est une CONVENTION À VALIDER avec Sekou (l'app n'a aucun droit de
// lecture SharePoint pour découvrir l'arborescence existante) : une seule constante à changer.

/** Sous-dossier de la copro où vont les pièces reçues par mail. À valider (cf. en-tête). */
export const DOSSIER_PIECES_RECUES = "Interventions";

/** Dossier racine de la copro, depuis son lien de dossier d'AG (on retire le dernier « /AG »). */
export function dossierCoproDepuisLienAg(lienAg: string): string {
  return lienAg.trim().replace(/\/+$/, "").replace(/\/AG$/i, "");
}

/** Sous-dossiers sous la racine de la copro : la convention, puis l'année de réception. */
export function sousDossiersPieceRecue(recuLeISO: string): string[] {
  return [DOSSIER_PIECES_RECUES, recuLeISO.slice(0, 4)];
}

/**
 * Nom du fichier déposé : « AAAA-MM-JJ - <nom d'origine> ». La date évite qu'une seconde
 * « facture.pdf » écrase la première (le dépôt remplace un fichier de même nom). Les
 * caractères refusés par SharePoint (" * : < > ? / \ | # %) deviennent des tirets.
 */
export function nomFichierDepose(nomOrigine: string, recuLeISO: string): string {
  const propre = nomOrigine.replace(/["*:<>?/\\|#%]+/g, "-").replace(/\s+/g, " ").trim() || "piece-jointe";
  return `${recuLeISO.slice(0, 10)} - ${propre}`;
}
