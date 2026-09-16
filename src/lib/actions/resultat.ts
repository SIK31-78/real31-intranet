// Le resultat d'une Server Action, UNE fois pour toutes (audit du 16/09/2026 : le type
// etait recopie dans sept fichiers, et 53 `catch` renvoyaient le message brut au navigateur,
// noms de tables et codes PostgREST compris).
//
// Regle : un message METIER (« Copropriété hors du périmètre », « Facture déjà émise ») est
// rendu tel quel ; un message TECHNIQUE (PostgREST, HTTP, réseau) est signalé à Sentry et
// remplacé par une phrase neutre. L'utilisateur voit quoi faire, pas le schéma de la base.

import { signalerException } from "@/lib/observabilite";

export type Res<T = undefined> = { ok: true; donnees?: T } | { ok: false; erreur: string };

export function echec(erreur: string): { ok: false; erreur: string } {
  return { ok: false, erreur };
}

const TECHNIQUE_RE =
  /PGRST|HTTP \d{3}|\bcolumn\b|\brelation\b|\bschema\b|violates|duplicate key|does not exist|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|timed? ?out|Unexpected token|JSON|permission denied|syntax error|null value in|invalid input syntax|GraphQL|ReferenceError|TypeError|undefined is not|Cannot read/i;

export const MESSAGE_TECHNIQUE = "Une erreur technique est survenue, elle a été signalée. Réessaie dans un instant.";

/** Un message technique ? (ce qui cartographie la base ou l'infra, pas ce qui guide l'utilisateur) */
export function estTechnique(message: string): boolean {
  return TECHNIQUE_RE.test(message);
}

/**
 * Le message a montrer pour une erreur rattrapee dans une action : le message metier tel
 * quel, ou une phrase neutre (et un signalement Sentry) si le message est technique.
 */
export function messageUtilisateur(e: unknown, contexte: string): string {
  const message = e instanceof Error ? e.message : String(e);
  if (message && !estTechnique(message)) return message;
  console.error(`[${contexte}]`, e);
  signalerException(e, { source: contexte });
  return MESSAGE_TECHNIQUE;
}

export function echecDepuis(e: unknown, contexte: string): { ok: false; erreur: string } {
  return echec(messageUtilisateur(e, contexte));
}
