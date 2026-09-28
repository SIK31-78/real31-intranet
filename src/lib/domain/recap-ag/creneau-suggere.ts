// Creneau d'AG propose par defaut dans la saisie du recap.
//
// L'heure de la prochaine AG planifiee est connue (fiche copro) : on la reprend plutot
// que d'imposer 18:00-20:00 a tout le monde (remontee 3ddcc065). La fin, elle, n'est
// jamais connue d'avance : debut + 2 h. Simple defaut, le gestionnaire corrige.

/** Creneau d'AG le plus frequent chez REAL31 : repli quand l'heure est inconnue. */
export const HEURE_DEBUT_AG_PAR_DEFAUT = "18:00";
export const DUREE_AG_PAR_DEFAUT_MINUTES = 120;

/** Heure "HH:mm" (ou "HH:mm:ss") valide ramenee a "HH:mm", sinon le repli 18:00. */
export function heureDebutSuggeree(heure: string | undefined): string {
  const hhmm = heure?.trim().slice(0, 5);
  return hhmm && /^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm) ? hhmm : HEURE_DEBUT_AG_PAR_DEFAUT;
}

/** Fin suggeree = debut + 2 h, bornee a 23:59 (le creneau reste sur la journee). */
export function heureFinSuggeree(debut: string): string {
  const [h, m] = debut.split(":").map(Number);
  const total = Math.min((h || 0) * 60 + (m || 0) + DUREE_AG_PAR_DEFAUT_MINUTES, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
