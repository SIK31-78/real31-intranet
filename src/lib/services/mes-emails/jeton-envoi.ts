// Jetons de l'envoi en trois temps (REA-421, 27/10/2026) : le brouillon préparé par
// `preparerEnvoiAction`, puis la session d'upload d'un gros fichier, sont remis au navigateur
// sous forme de jeton CHIFFRÉ (AES-256-GCM, clé tirée d'AUTH_SECRET) qu'il rend à chaque
// appel suivant. Pourquoi pas une Map en mémoire : sur Vercel, la route de dépôt et l'action
// suivante peuvent tomber sur deux instances différentes de la fonction, la Map de l'une ne
// connaît pas le brouillon de l'autre. Le jeton porte le gestionnaire et une expiration
// (15 min) : il ne sert qu'à la personne qui a préparé l'envoi, et pas au-delà. Chiffré, et
// pas seulement signé : l'URL d'une session d'upload vaut autorisation d'écrire, elle ne doit
// pas se lire dans le navigateur.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const DUREE_JETON_MS = 15 * 60 * 1000;

/** Le brouillon préparé : où il est, à qui, et ce qu'on a le droit d'en faire. */
export interface JetonBrouillon {
  nature: "brouillon";
  /** Boîte qui détient le brouillon (celle qui expédiera). */
  boite: string;
  draftId: string;
  /** Gestionnaire qui l'a préparé : le seul à pouvoir y déposer un fichier ou l'envoyer. */
  gid: string;
  /** « envoyer » : la garde d'envoi a été passée à la préparation ; « brouillon » : il reste dans Outlook. */
  mode: "envoyer" | "brouillon";
  /** Le mail auquel on répond et sa boîte : le statut « répondu » s'écrit après l'envoi. */
  emailId: string;
  coproCode: string;
  boiteMessage: string;
  exp: number;
}

/**
 * Un brouillon NEUF du compositeur « Envoyer un e-mail » (27/10/2026) : même dépôt par tranches
 * qu'une réponse, mais pas de mail d'origine ni de statut « répondu ». Nature à part : un jeton
 * de mail neuf ne se finalise pas comme une réponse, ni l'inverse. Toute la copropriété en copie
 * cachée part en plusieurs mails (lots) : un jeton par brouillon, `lot` sur `lots`.
 */
export interface JetonNeuf {
  nature: "neuf";
  boite: string;
  draftId: string;
  gid: string;
  /** « envoyer » : MAIL_ENVOI et `envoi` de la boîte vérifiés à la préparation. */
  mode: "envoyer" | "brouillon";
  lot: number;
  lots: number;
  /** Premier lot seulement : de quoi inscrire le mail au journal du dossier après l'envoi. */
  internetMessageId?: string;
  dossier?: { id: string; pour: string; objet: string };
  exp: number;
}

/** La session d'upload d'un fichier de plus de 3 Mo, entre deux tranches. */
export interface JetonUpload {
  nature: "upload";
  uploadUrl: string;
  draftId: string;
  gid: string;
  nom: string;
  taille: number;
  exp: number;
}

type Jeton = JetonBrouillon | JetonNeuf | JetonUpload;

let cleDev: Buffer | null = null;

function cle(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (secret) return createHash("sha256").update(`real31:envoi-mail:${secret}`).digest();
  // Sans AUTH_SECRET, la production refuse (un jeton serait falsifiable) ; en dev, une clé
  // propre au processus suffit (un seul serveur).
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET absent : envoi des pièces jointes impossible.");
  cleDev ??= randomBytes(32);
  return cleDev;
}

export function scellerJeton(j: Jeton): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", cle(), iv);
  const chiffre = Buffer.concat([c.update(JSON.stringify(j), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), chiffre]).toString("base64url");
}

/** Le jeton s'il est intact, de la bonne nature et pas expiré ; null sinon (jamais d'exception). */
export function ouvrirJeton<N extends Jeton["nature"]>(jeton: string, nature: N, maintenant = Date.now()): Extract<Jeton, { nature: N }> | null {
  try {
    const brut = Buffer.from(jeton, "base64url");
    if (brut.length < 29) return null;
    const d = createDecipheriv("aes-256-gcm", cle(), brut.subarray(0, 12));
    d.setAuthTag(brut.subarray(12, 28));
    const j = JSON.parse(Buffer.concat([d.update(brut.subarray(28)), d.final()]).toString("utf8")) as Jeton;
    if (j.nature !== nature || typeof j.exp !== "number" || j.exp < maintenant) return null;
    return j as Extract<Jeton, { nature: N }>;
  } catch {
    return null;
  }
}
