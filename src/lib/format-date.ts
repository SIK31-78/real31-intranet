// Helpers de formatage de dates pour l'UI.
// Volontairement deterministes (memes inputs -> meme output) pour eviter les
// hydration mismatches Server/Client.

const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** "2025-04-12" -> "12 avril 2025". Deterministe (UTC) pour eviter les
 *  hydration mismatches Server/Client. */
export function formatDateLongue(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${d.getUTCDate()} ${MOIS_FR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Format relatif court "il y a 2 j" / "hier" / "le 15/04" a partir d'une
 *  ancre de reference (date "aujourd'hui" passee par la page). */
export function formatAuditeRelatif(iso: string, aujourdhuiISO: string): string {
  const audit = new Date(iso).getTime();
  const ref = new Date(`${aujourdhuiISO}T12:00:00Z`).getTime();
  const diff = ref - audit;
  if (diff < 60_000) return "a l'instant";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.floor(heures / 24);
  if (jours === 1) return "hier";
  if (jours < 30) return `il y a ${jours} j`;
  const d = new Date(iso);
  return `le ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
