/**
 * Sur téléphone, la liste et le lecteur sont empilés (lg:flex-row seulement dès 1024 px) : le mail
 * ouvert s'affiche SOUS toute la liste, hors de l'écran, et le clic paraît sans effet. On
 * ramène donc le lecteur à l'écran quand la mise en page est empilée.
 */
export const LARGEUR_COTE_A_COTE = 1024;

export function lecteurSousLaListe(largeurFenetre: number): boolean {
  return largeurFenetre < LARGEUR_COTE_A_COTE;
}

export function amenerLecteurAEcran(lecteur: HTMLElement | null): void {
  if (!lecteur || typeof window === "undefined") return;
  if (!lecteurSousLaListe(window.innerWidth)) return;
  // Après le rendu du mail sélectionné.
  window.requestAnimationFrame(() => lecteur.scrollIntoView({ behavior: "smooth", block: "start" }));
}
