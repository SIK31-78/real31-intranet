// Preference "afficher mon agenda Outlook" du calendrier AG/CS, retenue d'une visite a
// l'autre. Confort d'affichage par navigateur : rien n'est stocke cote serveur.
//
// COOKIE et pas localStorage : la page est rendue par le serveur, qui n'a pas de
// localStorage. Avec localStorage il faudrait lire la preference APRES l'hydratation,
// donc rendre une case decochee puis la corriger - un rendu en cascade que la regle
// react-hooks/set-state-in-effect refuse a juste titre, et qui de toute facon faisait
// clignoter la case. Le cookie, lui, part avec la requete : le serveur connait deja la
// reponse et rend la case dans le bon etat du premier coup.

/** Nom du cookie. Partage par la page (lecture serveur) et la vue (ecriture client). */
export const COOKIE_AGENDA_OUTLOOK = "real31_calendrier_agenda";

/** Un an : c'est une preference d'affichage, elle n'a pas de raison d'expirer plus tot. */
const UN_AN_SECONDES = 31_536_000;

/**
 * Ecrit la preference (cote client uniquement). `SameSite=Lax` : ce cookie ne sert qu'a
 * nos propres pages et ne doit pas voyager sur des requetes tierces.
 */
export function ecrirePreferenceAgenda(actif: boolean): void {
  try {
    document.cookie = `${COOKIE_AGENDA_OUTLOOK}=${actif ? "1" : "0"}; path=/; max-age=${UN_AN_SECONDES}; SameSite=Lax`;
  } catch {
    // Cookies refuses : sans consequence, la case marche pour cette visite.
  }
}
