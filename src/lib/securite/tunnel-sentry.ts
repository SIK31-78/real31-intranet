// Le tunnel Sentry MAISON (audit du 16/09/2026). Celui du SDK (`tunnelRoute`) relayait vers
// n'importe quelle organisation / n'importe quel projet Sentry passes en query par le client :
// une porte ouverte a qui veut faire transiter ses enveloppes par real31.app. Ici, on ne
// relaie que les enveloppes dont l'en-tete porte NOTRE DSN (meme hote, meme projet).

import { decomposerDsn } from "./entetes-http";

/** Taille max d'une enveloppe relayee (un replay pese quelques centaines de Ko). */
export const TAILLE_MAX_ENVELOPPE = 2 * 1024 * 1024;

/**
 * L'URL d'ingestion Sentry pour cette enveloppe, ou null si elle n'est pas pour nous.
 * L'enveloppe commence par une ligne JSON (`{"dsn":"…", …}`) : c'est elle qu'on controle.
 */
export function destinationEnveloppe(enveloppe: string, dsnAttendu: string | undefined): string | null {
  const attendu = decomposerDsn(dsnAttendu);
  if (!attendu) return null;
  const premiereLigne = enveloppe.slice(0, enveloppe.indexOf("\n") === -1 ? enveloppe.length : enveloppe.indexOf("\n"));
  let entete: { dsn?: unknown };
  try {
    entete = JSON.parse(premiereLigne) as { dsn?: unknown };
  } catch {
    return null;
  }
  const recu = typeof entete.dsn === "string" ? decomposerDsn(entete.dsn) : null;
  if (!recu || recu.hote !== attendu.hote || recu.projet !== attendu.projet || recu.cle !== attendu.cle) return null;
  return `https://${attendu.hote}/api/${attendu.projet}/envelope/`;
}
