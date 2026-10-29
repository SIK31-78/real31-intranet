// « Répondre » comme dans Outlook (retour des collègues, 29/10/2026) : un clic et on écrit.
// La réponse s'ouvre en haut du volet ; on la remonte à l'écran seulement s'il le faut, puis
// le curseur se pose au début du texte de la réponse (pas dans l'objet).

/** Faut-il faire défiler la page jusqu'à la réponse ? Oui si son haut est sorti de l'écran
 *  par le haut, ou si la zone de texte dépasse en bas. Sinon on ne bouge pas : l'objet et
 *  l'expéditeur, juste au-dessus, restent visibles. */
export function doitDefilerVersReponse(p: { hautBloc: number; basZone: number; hauteurFenetre: number }): boolean {
  return p.hautBloc < 0 || p.basZone > p.hauteurFenetre;
}

/** Remonte la réponse si besoin et pose le curseur au début de son texte (zone de texte
 *  simple ou éditeur mis en forme). */
export function ecrireDansLaReponse(bloc: HTMLElement, conteneurTexte: HTMLElement): void {
  const zone = conteneurTexte.querySelector<HTMLElement>("textarea, [contenteditable]");
  if (!zone) return;
  if (
    doitDefilerVersReponse({
      hautBloc: bloc.getBoundingClientRect().top,
      basZone: zone.getBoundingClientRect().bottom,
      hauteurFenetre: window.innerHeight,
    })
  ) {
    bloc.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  zone.focus({ preventScroll: true });
  if (zone instanceof HTMLTextAreaElement) {
    zone.setSelectionRange(0, 0);
    zone.scrollTop = 0;
  } else {
    window.getSelection()?.collapse(zone, 0);
  }
}
