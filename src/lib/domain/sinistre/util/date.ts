/** Utilitaires de date (G-2). */

/** Date du jour au format ISO `YYYY-MM-DD`, en heure locale. */
export function aujourdhuiISO(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Vrai si la date ISO fournie (non vide) est postérieure à aujourd'hui. */
export function dateEstFuture(dateISO: string): boolean {
  return dateISO !== '' && dateISO > aujourdhuiISO();
}
