// Pagination CURSOR de l'API v1 (module pur, testable offline).
//
// Les listes de l'intranet sont petites (quelques centaines de copros) et deja
// chargees en memoire par les services : le curseur est donc un OFFSET opaque
// (base64url de "v1:<offset>"), stable tant que le tri amont est deterministe
// (les handlers trient toujours par une cle stable avant de paginer).
// Contrat : `?cursor=&limit=` avec limit max 100 (defaut 50).

export const LIMITE_MAX = 100;
export const LIMITE_DEFAUT = 50;

export interface PageResultat<T> {
  items: T[];
  /** Curseur de la page suivante ; absent = derniere page. */
  nextCursor?: string;
  /** Taille totale de la liste (les listes API v1 tiennent en memoire). */
  total: number;
}

function encoderCursor(offset: number): string {
  return Buffer.from(`v1:${offset}`, "utf8").toString("base64url");
}

/** Offset porte par un curseur ; null si le curseur est invalide/forge. */
export function decoderCursor(cursor: string): number | null {
  try {
    const brut = Buffer.from(cursor, "base64url").toString("utf8");
    const m = /^v1:(\d{1,9})$/.exec(brut);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/** Borne la limite demandee dans [1, LIMITE_MAX] ; defaut LIMITE_DEFAUT. */
export function normaliserLimite(limit: string | null): number {
  if (!limit) return LIMITE_DEFAUT;
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1) return LIMITE_DEFAUT;
  return Math.min(n, LIMITE_MAX);
}

/**
 * Page d'une liste deja triee. Curseur invalide = on repart du debut (tolerant :
 * un client qui a garde un vieux curseur n'obtient jamais une 500).
 */
export function paginer<T>(items: T[], cursor: string | null, limit: string | null): PageResultat<T> {
  const taille = normaliserLimite(limit);
  const offset = cursor ? (decoderCursor(cursor) ?? 0) : 0;
  const depart = Math.min(offset, items.length);
  const page = items.slice(depart, depart + taille);
  const suivant = depart + page.length;
  return {
    items: page,
    total: items.length,
    ...(suivant < items.length ? { nextCursor: encoderCursor(suivant) } : {}),
  };
}
