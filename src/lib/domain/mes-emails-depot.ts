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

const PARIS = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * « AAAA-MM-JJ » du jour de réception À PARIS. Graph horodate en UTC : « 2026-10-13T22:30:00Z »
 * est le 14 octobre à Paris, et couper les dix premiers caractères datait le fichier de la
 * veille (27/10/2026). Une date nue (« 2026-10-13 ») reste telle quelle.
 */
function jourParisDe(iso: string): string {
  const d = new Date(iso);
  return iso.includes("T") && !Number.isNaN(d.getTime()) ? PARIS.format(d) : iso.slice(0, 10);
}

/** Dossier racine de la copro, depuis son lien de dossier d'AG (on retire le dernier « /AG »). */
export function dossierCoproDepuisLienAg(lienAg: string): string {
  return lienAg.trim().replace(/\/+$/, "").replace(/\/AG$/i, "");
}

/** Sous-dossiers sous la racine de la copro : la convention, puis l'année de réception. */
export function sousDossiersPieceRecue(recuLeISO: string): string[] {
  return [DOSSIER_PIECES_RECUES, jourParisDe(recuLeISO).slice(0, 4)];
}

/**
 * Nom du fichier déposé : « AAAA-MM-JJ - <nom d'origine> ». La date évite qu'une seconde
 * « facture.pdf » écrase la première (le dépôt remplace un fichier de même nom). Les
 * caractères refusés par SharePoint (" * : < > ? / \ | # %) deviennent des tirets.
 */
export function nomFichierDepose(nomOrigine: string, recuLeISO: string): string {
  const propre = nomOrigine.replace(/["*:<>?/\\|#%]+/g, "-").replace(/\s+/g, " ").trim() || "piece-jointe";
  return `${jourParisDe(recuLeISO)} - ${propre}`;
}
