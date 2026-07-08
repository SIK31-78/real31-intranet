// Heure des reunions AG / CS (decision Sekou 2026-07-08). Le patron veut une HEURE
// sur les evenements Outlook des dates d'AG/CS (avant : journee entiere sans heure).
// Logique PURE (domaine, ADR-001) : constantes + helpers deterministes, zero
// dependance technique. L'heure se stocke DANS le timestamp du referentiel
// (public.Copropriete.nextAGDate/nextCSDate, deja des TIMESTAMPS) : pas de colonne.

/** Heure pre-remplie par defaut a la saisie d'une date d'AG / CS ("HH:mm"). */
export const HEURE_DEFAUT_REUNION = "18:00";

/** Duree par defaut d'une reunion AG / CS, en heures (evenement Outlook). */
export const DUREE_REUNION_HEURES = 2;

/**
 * Extrait l'heure "HH:mm" d'un timestamp referentiel ('YYYY-MM-DDTHH:mm:ss...').
 * Lue DEPUIS LA CHAINE (jamais via `new Date`) pour eviter tout decalage de fuseau.
 * Regle : "00:00" (minuit) = donnees existantes posees sans heure -> pas d'heure
 * (journee entiere, retrocompatible) ; format illisible -> pas d'heure non plus.
 */
export function heureDe(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const m = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return undefined;
  const hhmm = `${m[1]}:${m[2]}`;
  return hhmm === "00:00" ? undefined : hhmm;
}

/**
 * Fin d'une reunion = debut + DUREE_REUNION_HEURES. `debut` est un datetime local
 * 'YYYY-MM-DDTHH:mm' ou 'YYYY-MM-DDTHH:mm:ss' ; renvoie le meme format en secondes.
 * Calcul en UTC (deterministe, gere le passage de minuit / de mois) : on ne fait
 * qu'ajouter des heures a des composantes lues telles quelles, sans fuseau reel.
 * Entree non datetime (jour seul...) -> renvoyee inchangee (defensif).
 */
export function finReunion(debut: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(debut.trim());
  if (!m) return debut;
  const [, y, mo, d, h, min, s] = m;
  const base = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(min), s ? Number(s) : 0));
  base.setUTCHours(base.getUTCHours() + DUREE_REUNION_HEURES);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}` +
    `T${pad(base.getUTCHours())}:${pad(base.getUTCMinutes())}:${pad(base.getUTCSeconds())}`
  );
}
