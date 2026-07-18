// Regles de facturation communes aux honoraires de syndic (REAL31).
// Pur, deterministe, zero dependance technique (cf. ADR-001 / domain/README).
//
// Portage des ecrans PowerApps de facturation (DepassementCS, Recap AG...).
// Convention monetaire actee : la table `Tarifs` stocke des montants TTC ;
// le HT facture = TTC / 1,2. Cf. mythec-refactor/powerapps/MIGRATION_PLAN.md #1/#3.

/** Taux de TVA normal applique aux honoraires de syndic (20 %). */
export const TAUX_TVA = 0.2;

/** Convertit un montant TTC en HT. Les tarifs REAL31 sont saisis TTC ; on facture
 *  le HT correspondant (identique au `montant / 1.2` des ecrans PowerApps). */
export function htDepuisTtc(montantTtc: number): number {
  return montantTtc / (1 + TAUX_TVA);
}

/** Arrondit un nombre d'heures a la demi-heure superieure : toute fraction d'heure
 *  entamee compte comme une demi-heure pleine (equivalent `RoundUp(h/0.5)*0.5`).
 *  Passe par les minutes entieres pour rester insensible au bruit flottant des
 *  divisions par 60. */
export function arrondirDemiHeureSuperieure(heures: number): number {
  const minutes = Math.round(heures * 60);
  return (Math.ceil(minutes / 30) * 30) / 60;
}

/** Creneau horaire (heure "murale"), decompose pour rester deterministe sans objet
 *  `Date` : c'est ainsi que les ecrans PowerApps saisissaient date + heure + minute
 *  via des controles separes. */
export interface Creneau {
  /** Jour de debut, ISO "YYYY-MM-DD". */
  jourDebut: string;
  /** Heure de debut, 0-23. */
  heureDebut: number;
  /** Minute de debut, 0-59. */
  minuteDebut: number;
  /** Jour de fin, ISO "YYYY-MM-DD" (egal a `jourDebut` dans le cas normal). */
  jourFin: string;
  /** Heure de fin, 0-23. */
  heureFin: number;
  /** Minute de fin, 0-59. */
  minuteFin: number;
}

/** Positions du creneau en minutes relatives a minuit du jour de debut.
 *  `fin` peut depasser 1440 si le creneau court sur plusieurs jours. */
export interface CreneauEnMinutes {
  debut: number;
  fin: number;
}

function minutesDepuisMinuit(heure: number, minute: number): number {
  return heure * 60 + minute;
}

/** Nombre de jours calendaires entre deux dates ISO (UTC, deterministe). */
function joursEntreISO(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split("-").map(Number);
  const [by, bm, bd] = bISO.split("-").map(Number);
  return (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000;
}

/** Exprime debut et fin du creneau en minutes depuis minuit du jour de debut.
 *  Sert a comparer les instants reels aux bornes horaires contractuelles (AG). */
export function creneauEnMinutes(c: Creneau): CreneauEnMinutes {
  const debut = minutesDepuisMinuit(c.heureDebut, c.minuteDebut);
  const fin = joursEntreISO(c.jourDebut, c.jourFin) * 1440 + minutesDepuisMinuit(c.heureFin, c.minuteFin);
  return { debut, fin };
}

/** Duree du creneau en minutes (gere un creneau sur plusieurs jours). */
export function dureeCreneauMinutes(c: Creneau): number {
  const { debut, fin } = creneauEnMinutes(c);
  return fin - debut;
}
