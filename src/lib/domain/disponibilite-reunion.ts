// Blocage "occupe" d'une date d'AG / CS (decision Sekou 2026-07 : un creneau OCCUPE
// interdit de fixer la date). Logique PURE (domaine, ADR-001) : testable offline, aucune
// dependance technique, reutilisee cote UI (bouton grise) ET cote serveur (refus de
// l'action, defense en profondeur).
//
// PROBLEME DU FAUX POSITIF (replanification) : quand on re-pose une date, l'evenement
// Outlook DEJA projete du gestionnaire occupe deja SON PROPRE creneau. getSchedule
// (free/busy) ne sait pas distinguer "notre" evenement d'un vrai conflit : il rendra
// "occupe" a cause de notre propre reservation. On ne doit donc PAS controler une cible
// dont un "occupe" ne pourrait venir que de nous-memes.
//
// REGLE (tolerance par egalite de creneau, cf. consigne "tolerer quand la date+heure+
// salle sont inchangees") : notre evenement vit au creneau ANCIEN. Si le creneau ne
// bouge pas, un "occupe" sur l'agenda / la salle deja reservee / un collegue deja invite
// vient de nous -> on ne le controle pas. Si le creneau (ou la ressource / le collegue)
// change, la cible n'a pas encore notre evenement au nouveau creneau -> controle reel.
//
// LIMITE ASSUMEE : un simple DECALAGE d'heure le meme jour (ex. 18:00 -> 18:30) est un
// changement de creneau -> on controle l'agenda, et notre ancien evenement (18:00-20:00)
// chevauche la nouvelle fenetre (18:30-20:30) -> faux "occupe" possible. On prefere ce
// faux positif (l'utilisateur change juste l'heure de quelques minutes) a un faux negatif
// (laisser passer un vrai double-booking) : le blocage est un garde-fou anti-collision.

/** Un creneau de reservation : date + heure + salle + collegues invites. Champs vides
 *  ("" / []) quand la donnee est absente (pas encore de date, aucune salle, etc.). */
export type CreneauReservation = {
  /** "YYYY-MM-DD" ou "". */
  date: string;
  /** "HH:mm" ou "". */
  heure: string;
  /** Email de la salle reservee, ou "". */
  salle: string;
  /** Emails des collegues invites (forme canonique). */
  collaborateurs: string[];
};

/** Cibles a controler reellement (les autres verraient un "occupe" venu de nous-memes). */
export type PlanControlesDispo = {
  /** Controler l'agenda du gestionnaire (mon agenda) ? */
  verifierAgenda: boolean;
  /** Email de la salle a controler, ou null (aucune / deja reservee par nous au meme creneau). */
  salleAverifier: string | null;
  /** Emails des collegues a controler (les nouveaux invites, ou tous si le creneau bouge). */
  collaborateursAverifier: string[];
};

/** Deux emails designent-ils la meme boite (casse / espaces ignores) ? */
function memeEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Decide quelles cibles doivent etre controlees (dispo Graph reelle) pour le NOUVEAU
 * creneau, en excluant celles dont un "occupe" ne pourrait provenir que de notre propre
 * evenement deja projete au creneau ANCIEN (cf. entete). Fonction pure.
 *
 * - `ancien` : creneau actuellement enregistre (referentiel + confirmation). Champs vides
 *   si rien n'est encore pose.
 * - `nouveau` : creneau que l'on s'apprete a poser.
 */
export function planifierControlesDispo(
  ancien: CreneauReservation,
  nouveau: CreneauReservation,
): PlanControlesDispo {
  // Un evenement projete n'existe que si un creneau (date + heure) etait deja pose.
  const slotAncienDefini = Boolean(ancien.date && ancien.heure);
  // Creneau inchange = meme jour ET meme heure qu'avant : notre evenement est pile la.
  const slotInchange =
    slotAncienDefini && ancien.date === nouveau.date && ancien.heure === nouveau.heure;

  // Mon agenda : si le creneau ne bouge pas, un "occupe" vient de mon propre evenement.
  const verifierAgenda = !slotInchange;

  // Salle : a controler si une salle est choisie ET (le creneau bouge OU c'est une AUTRE
  // salle que celle deja reservee par nous). Meme salle + meme creneau => notre reservation.
  const salleAverifier =
    nouveau.salle && (!slotInchange || !memeEmail(nouveau.salle, ancien.salle))
      ? nouveau.salle
      : null;

  // Collegues : a controler ceux qui sont NOUVEAUX (pas deja invites) ou tous si le
  // creneau bouge. Un collegue deja invite au meme creneau verrait notre propre evenement.
  const collaborateursAverifier = nouveau.collaborateurs.filter(
    (c) => !slotInchange || !ancien.collaborateurs.some((a) => memeEmail(a, c)),
  );

  return { verifierAgenda, salleAverifier, collaborateursAverifier };
}
