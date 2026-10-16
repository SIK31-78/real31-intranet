// Le corps MIS EN FORME d'un mail (REA-345, 16/10/2026, en pilote), tel que le serveur
// accepte de l'envoyer : renettoyé ici quoi que le navigateur ait envoyé, habillé de la
// police du cabinet, avec son texte équivalent (contrôle « message vide », journal).

import { htmlMailMisEnForme, htmlVersTexte, nettoyerHtmlMail } from "@/lib/domain/mes-emails-html";

/** 200 000 caractères : un long mail mis en forme tient très en dessous. */
const TAILLE_MAX = 200_000;

/**
 * null = pas de mise en forme demandée (texte seul, comme avant) ; "refuse" = demandée par
 * quelqu'un hors pilote, ou trop grosse ; sinon le corps prêt à partir.
 */
export function corpsMisEnForme(pilote: boolean, brut: unknown): { corps: string; corpsHtml: string } | "refuse" | null {
  if (brut === undefined || brut === null || brut === "") return null;
  if (!pilote || typeof brut !== "string" || brut.length > TAILLE_MAX) return "refuse";
  const propre = nettoyerHtmlMail(brut);
  return { corps: htmlVersTexte(propre), corpsHtml: htmlMailMisEnForme(propre) };
}
