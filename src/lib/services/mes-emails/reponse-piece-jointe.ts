// La réponse HTTP d'une pièce jointe servie EN FLUX (REA-421, 27/10/2026), commune aux routes
// /mes-emails/pj et /tri-emails/pj : les paramètres validés, le corps de Graph relayé sans
// passer par la mémoire, et des en-têtes qui ne laissent rien s'exécuter. Avant, la pièce
// voyageait en base64 dans la réponse d'une action serveur, refusée par Vercel au-delà de 3,3 Mo.

import { PieceJointeIntrouvable, apercuPossible, dispositionContenu, typePieceJointe } from "@/lib/domain/piece-jointe-flux";

export interface ParametresPj {
  /** Boîte qui détient le mail (absente : la boîte perso, côté E-mails). */
  boite?: string;
  /** internetMessageId du mail. */
  message: string;
  /** Id Graph de la pièce. */
  pj: string;
  /** true : aperçu dans la page (PDF, image) ; false : téléchargement. */
  inline: boolean;
}

// Mêmes bornes que les actions : l'id d'une pièce est du base64 (il part dans une URL Graph,
// jamais autre chose), le message un identifiant sans caractère de contrôle.
const RE_PJ = /^[A-Za-z0-9_\-=+/]{1,600}$/;
const RE_MESSAGE = /^[^\x00-\x1f\x7f]{1,600}$/;
const RE_BOITE = /^[^\s]{1,320}$/;

export function lireParametresPj(sp: URLSearchParams): ParametresPj | null {
  const message = sp.get("message") ?? "";
  const pj = sp.get("pj") ?? "";
  const boite = sp.get("boite")?.trim() || undefined;
  if (!RE_MESSAGE.test(message) || !RE_PJ.test(pj) || (boite !== undefined && !RE_BOITE.test(boite))) return null;
  return { message, pj, inline: sp.get("inline") === "1", ...(boite ? { boite } : {}) };
}

const ENTETES_COMMUNS = {
  // Une pièce de la boîte d'un collègue ne doit rester dans aucun cache (proxy, disque).
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export function reponseRefusPj(statut: number, message: string): Response {
  return new Response(message, { status: statut, headers: { ...ENTETES_COMMUNS, "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * Le flux de Graph relayé tel quel. Pas de Content-Length : Graph n'en donne pas sur $value,
 * et la taille annoncée de la pièce dépasse son contenu réel. Seuls un PDF et une image
 * s'affichent dans la page (dans l'iframe de la visionneuse : SAMEORIGIN) ; tout autre type part
 * en téléchargement, dans un bac à sable : un HTML ou un SVG joint ne s'exécute jamais chez nous.
 */
export function reponsePieceJointe(pj: { nom: string; type: string; corps: ReadableStream<Uint8Array> }, inline: boolean): Response {
  const type = typePieceJointe(pj.nom, pj.type);
  const enLigne = inline && apercuPossible(type);
  return new Response(pj.corps, {
    status: 200,
    headers: {
      ...ENTETES_COMMUNS,
      "Content-Type": type,
      "Content-Disposition": dispositionContenu(pj.nom, enLigne),
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": enLigne
        ? type === "application/pdf"
          ? "frame-ancestors 'self'"
          : "default-src 'none'; frame-ancestors 'self'"
        : "sandbox; default-src 'none'; frame-ancestors 'none'",
    },
  });
}

/** Mail ou pièce disparus : 404. Le reste (Graph en panne, droits) : 502, journalisé. */
export function reponseEchecPj(e: unknown, contexte: string): Response {
  if (e instanceof PieceJointeIntrouvable) return reponseRefusPj(404, "Pièce jointe introuvable : le mail a peut-être été déplacé ou supprimé.");
  console.warn(`[${contexte}] pièce jointe indisponible :`, e instanceof Error ? e.message : e);
  return reponseRefusPj(502, "Pièce jointe indisponible pour le moment : réessaie, ou ouvre-la dans Outlook.");
}
