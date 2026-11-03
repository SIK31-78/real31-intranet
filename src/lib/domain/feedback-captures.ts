// Captures d'ecran jointes a une remontee (REA-255). Pas de colonne en base : les images
// vivent dans le bucket prive « feedback », sous un dossier par remontee, et leur
// presence se lit en listant ce dossier. Le cron Linear les recopie dans le ticket.

export const TYPES_CAPTURE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
export const NB_MAX_CAPTURES = 3;
/** Total des captures d'un envoi : sous la limite de 4 Mo des server actions. */
export const TAILLE_MAX_CAPTURES = 3.5 * 1024 * 1024;

export interface CaptureAEnvoyer {
  contentType: string;
  taille: number;
}

/** Message lisible si les captures ne passent pas, null sinon. */
export function erreurCaptures(captures: readonly CaptureAEnvoyer[]): string | null {
  if (captures.length > NB_MAX_CAPTURES) return `${NB_MAX_CAPTURES} captures au maximum.`;
  if (captures.some((c) => !TYPES_CAPTURE[c.contentType])) return "Captures acceptées : PNG, JPEG ou WebP.";
  if (captures.some((c) => c.taille === 0)) return "Une capture est vide.";
  const total = captures.reduce((s, c) => s + c.taille, 0);
  if (total > TAILLE_MAX_CAPTURES) return "Captures trop lourdes (3,5 Mo au total) : retires-en une.";
  return null;
}

export function dossierCaptures(feedbackId: string): string {
  return `captures/${feedbackId}`;
}

export function cheminCapture(feedbackId: string, index: number, contentType: string): string {
  return `${dossierCaptures(feedbackId)}/${index + 1}.${TYPES_CAPTURE[contentType] ?? "png"}`;
}

/** Type MIME deduit de l'extension d'un chemin stocke. */
export function typeDeChemin(chemin: string): string {
  const ext = chemin.split(".").pop()?.toLowerCase();
  return Object.entries(TYPES_CAPTURE).find(([, e]) => e === ext)?.[0] ?? "image/png";
}
