// Pièces jointes servies en flux et envoyées par tranches (REA-421, 27/10/2026). Avant, une
// pièce passait en base64 dans la réponse d'une action serveur : au-delà de 3,3 Mo environ,
// Vercel refusait la réponse (4,5 Mo au plus) sans message clair. Ici, les règles pures
// partagées par les routes, l'adaptateur Graph et l'écran.

/** Sous ce seuil, Graph prend la pièce en un seul POST (fileAttachment en base64). Au-delà, il
 *  exige une session d'upload. */
export const TAILLE_ENVOI_SIMPLE = 3 * 1024 * 1024;

/** Une tranche de session d'upload : Graph veut un multiple de 320 Kio. 12 × 320 Kio = 3,75 Mio,
 *  pour rester sous les 4,5 Mo qu'une fonction Vercel accepte par requête (le navigateur envoie
 *  ses fichiers tranche par tranche à la route de dépôt). */
export const TRANCHE_UPLOAD = 12 * 320 * 1024;

/** Un fichier joint à une réponse : 25 Mo. */
export const TAILLE_MAX_FICHIER = 25 * 1024 * 1024;

/** Toutes les pièces d'une réponse (fichiers ajoutés et pièces re-jointes) : 25 Mo. Exchange
 *  Online refuse par défaut un message de plus de 35 Mo (MaxSendSize), compté APRÈS l'encodage
 *  base64 (+33 %) : 25 Mo de fichiers font environ 33 Mo à l'envoi. */
export const TAILLE_MAX_TOTALE = 25 * 1024 * 1024;

export const NB_MAX_FICHIERS = 10;

const MIME_PAR_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

/**
 * Type MIME fiable d'une pièce jointe : l'extension connue prime sur ce que Graph déclare (il
 * renvoie souvent « application/octet-stream » pour un PDF ou une image, et le navigateur
 * télécharge alors au lieu d'afficher, constat du 13/10/2026).
 */
export function typePieceJointe(nom: string, declare: string | null | undefined): string {
  const ext = /\.([a-z0-9]+)$/i.exec(nom)?.[1]?.toLowerCase() ?? "";
  return MIME_PAR_EXT[ext] ?? (declare?.trim() || "application/octet-stream");
}

/**
 * Les seuls types affichés DANS la page (aperçu) : PDF et images matricielles. Une pièce HTML
 * ou SVG servie en ligne depuis l'intranet exécuterait son script avec nos cookies : elle part
 * toujours en téléchargement.
 */
export function apercuPossible(type: string): boolean {
  return type === "application/pdf" || /^image\/(png|jpeg|gif|webp|bmp)$/.test(type);
}

/** En-tête Content-Disposition, nom encodé selon la RFC 5987 (accents, espaces, guillemets). */
export function dispositionContenu(nom: string, inline: boolean): string {
  const propre = nom.replace(/[\r\n"\\]/g, "_").trim() || "piece-jointe";
  const ascii = propre.replace(/[^\x20-\x7e]/g, "_");
  const encode = encodeURIComponent(propre).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encode}`;
}

/** L'en-tête Content-Range d'une tranche [debut, debut + longueur) d'un fichier de `taille` octets. */
export function plageTranche(debut: number, longueur: number, taille: number): string {
  return `bytes ${debut}-${debut + longueur - 1}/${taille}`;
}

/** Le mail ou la pièce n'existe plus dans la boîte (déplacé, supprimé, id périmé) : 404, pas 502. */
export class PieceJointeIntrouvable extends Error {}

/** L'adresse d'une pièce sur la route en flux de l'écran (aperçu : inline ; sinon téléchargement). */
export function urlPieceJointe(
  ecran: "mes-emails" | "tri-emails",
  p: { boite?: string | undefined; message: string; pj: string; inline: boolean },
): string {
  const q = new URLSearchParams({ message: p.message, pj: p.pj, inline: p.inline ? "1" : "0" });
  if (p.boite) q.set("boite", p.boite);
  return `/${ecran}/pj?${q.toString()}`;
}
