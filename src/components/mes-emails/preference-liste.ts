// Préférence « collègues en haut / en bas » de la liste E-mails (REA-351, 16/10/2026).
// Cookie et pas localStorage, comme preference-agenda.ts : la page est rendue par le
// serveur, qui lit le cookie et rend la liste dans le bon ordre du premier coup (pas de
// liste qui se réordonne après l'hydratation).

import type { PlaceInternes } from "@/lib/domain/mes-emails-liste";

export const COOKIE_PLACE_INTERNES = "real31_emails_internes";

const UN_AN_SECONDES = 31_536_000;

export function ecrirePlaceInternes(v: PlaceInternes): void {
  try {
    document.cookie = `${COOKIE_PLACE_INTERNES}=${v}; path=/; max-age=${UN_AN_SECONDES}; SameSite=Lax`;
  } catch {
    // Cookies refusés : le choix vaut pour cet affichage.
  }
}
