// Alerte « mandat qui se termine sans AG planifiee ».
//
// Sekou (14/09/2026) : « un systeme pour qu'on passe pas a cote ». Le renouvellement du
// contrat de syndic se vote en AG ; si a trois mois de la fin du mandat aucune AG n'est
// posee, la chaine convocation -> contrat -> AG -> recap ne peut plus tenir dans les
// delais (mise sous pli a J-31, ODJ au CS bien avant). C'est LA qu'il faut prevenir,
// pas quand le mandat est deja fini.
//
// Ne s'applique qu'aux copros ou rien n'est engage (etat « a-planifier ») : une AG
// planifiee, un contrat genere ou un recap en attente sont deja suivis ailleurs.
// Fonction pure.

/** A combien de mois de la fin du mandat on commence a alerter. */
export const SEUIL_ALERTE_MANDAT_MOIS = 3;

export interface AlerteMandat {
  /** Jours restants avant la fin du mandat. Negatif : le mandat est deja fini. */
  joursAvantFin: number;
  /** `echu` = mandat termine sans AG posee : le syndic gere sans mandat valide. */
  niveau: "proche" | "echu";
}

function plusMois(iso: string, mois: number): string {
  const [a, m, j] = iso.split("-").map(Number);
  // Date.UTC normalise un 31 qui deborde (31/11 -> 01/12) : acceptable pour un seuil.
  return new Date(Date.UTC(a, m - 1 + mois, j)).toISOString().slice(0, 10);
}

function joursEntre(deISO: string, aISO: string): number {
  return Math.round((Date.parse(`${aISO}T00:00:00Z`) - Date.parse(`${deISO}T00:00:00Z`)) / 86_400_000);
}

/**
 * null si la fin du mandat est encore loin (au-dela du seuil) ; sinon l'alerte.
 * `finMandatISO` = fin du contrat EN COURS (cf. finContratEnCours), `aujourdhuiISO` injecte.
 */
export function alerteMandat(finMandatISO: string, aujourdhuiISO: string): AlerteMandat | null {
  if (finMandatISO > plusMois(aujourdhuiISO, SEUIL_ALERTE_MANDAT_MOIS)) return null;
  const joursAvantFin = joursEntre(aujourdhuiISO, finMandatISO);
  return { joursAvantFin, niveau: joursAvantFin < 0 ? "echu" : "proche" };
}
