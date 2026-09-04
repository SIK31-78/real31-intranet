// « Mes récaps » : ce qui, dans l'historique, releve de l'utilisateur qui regarde.
//
// POURQUOI. L'ecran listait les 50 derniers recaps DU CABINET. Un gestionnaire y
// cherchait les siens au milieu de ceux des 40 autres collaborateurs - la liste etait
// exacte et inutilisable. On la ramene par defaut a son perimetre, avec un basculeur
// « Tous » pour retrouver la vue large quand on la veut.
//
// DEUX appartenances, pas une, parce que les deux existent en vrai :
//   - la COPRO est dans son portefeuille (le cas courant) ;
//   - il a SAISI le recap (initiales `cree_par`), meme si la copro a change de main
//     depuis, ou s'il a depanne un collegue absent. Sans ce second critere, son propre
//     travail disparaitrait de sa liste apres une reattribution de portefeuille.
//
// Ce n'est PAS une garde de securite : le cloisonnement de lecture reste cote serveur.
// C'est un filtre de confort, d'ou le basculeur « Tous » assume.

export type PorteeRecaps = "moi" | "tous";

/** Ce qu'il faut d'un recap pour trancher son appartenance. */
export interface RecapAttribuable {
  coproCode: string;
  /** Initiales de l'auteur du recap (`cree_par`). */
  par?: string;
}

/** Criteres pre-normalises (Set + majuscules) : la liste des copros peut faire ~265 codes. */
export interface AppartenanceRecaps {
  coproCodes: ReadonlySet<string>;
  initiales?: string;
}

/** Comparaison insensible a la casse et aux espaces : les initiales sont saisies a la main. */
function normaliser(v: string): string {
  return v.trim().toUpperCase();
}

export function appartenanceRecaps(
  coproCodes: readonly string[],
  initiales?: string,
): AppartenanceRecaps {
  const cle = initiales ? normaliser(initiales) : "";
  return {
    coproCodes: new Set(coproCodes.map(normaliser)),
    ...(cle ? { initiales: cle } : {}),
  };
}

/** Ce recap releve-t-il de l'utilisateur : sa copro, ou sa saisie ? */
export function estMonRecap(recap: RecapAttribuable, a: AppartenanceRecaps): boolean {
  if (a.coproCodes.has(normaliser(recap.coproCode))) return true;
  return Boolean(a.initiales && recap.par && normaliser(recap.par) === a.initiales);
}

/**
 * Filtre d'affichage, applique cote client sur un jeu DEJA cloisonne par le serveur.
 * L'appartenance est calculee en amont (`mien`) : un Set ne traverse pas la frontiere
 * serveur -> client, et on ne recalcule pas la meme chose a chaque clic.
 */
export function filtrerParPortee<T extends { mien: boolean }>(
  recaps: readonly T[],
  portee: PorteeRecaps,
): T[] {
  return portee === "tous" ? [...recaps] : recaps.filter((r) => r.mien);
}
