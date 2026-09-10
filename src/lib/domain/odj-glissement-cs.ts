// Domaine PUR du "glissement" de la date de conseil syndical.
//
// LE PROBLEME (remonte par Sekou le 2026-09-10 sur BLEUETS4) : une date de PROCHAIN CS
// ne redevient jamais un DERNIER CS. La fiche affichait "Dernier CS : 5 sept. 2025" et
// "Prochain CS : 3 sept. 2026" alors qu'on etait le 10 septembre 2026 : la reunion avait
// eu lieu, mais le referentiel continuait de l'annoncer comme a venir. Personne ne va
// recorriger deux dates a la main sur 264 copros.
//
// LE DECLENCHEUR (choisi par Sekou) : "marquer la reunion comme terminee" sur l'ODJ.
// C'est le seul geste ou le gestionnaire affirme explicitement que le CS s'est TENU -
// et il est deja reversible (rouvrir l'ODJ). On ne devine rien a partir de l'horloge :
// une date passee peut tres bien correspondre a un CS reporte et jamais tenu.
//
// LA REVERSIBILITE : la cloture de l'ODJ se defait. Le glissement doit donc se defaire
// aussi, a l'identique. On ne peut pas le recalculer apres coup (l'ancienne "derniere"
// date est ecrasee), donc on la MEMORISE, serialisee comme la cloture : une chaine
// "<datePasseeEnDerniere>|<ancienneDerniere>" dans la table d'etat de l'ODJ. Zero SQL a
// passer a la main, meme parti que CLE_CLOTURE_ODJ et PREFIXE_POINT.

/** Ce qu'un glissement a deplace, pour pouvoir le remettre a l'identique. */
export interface GlissementCs {
  /** Date qui est passee de "prochain CS" a "dernier CS". */
  glissee: string;
  /** Ce qu'il y avait en "dernier CS" AVANT (vide = il n'y en avait pas). */
  ancienneDerniere: string;
}

/**
 * Le CS doit-il glisser ? OUI seulement si une prochaine date existe ET qu'elle n'est
 * pas dans le futur : cloturer un ODJ prepare en avance (CS prevu la semaine prochaine)
 * ne doit rien deplacer, sinon on perdrait la date de la reunion a venir.
 * Comparaison sur le JOUR : un CS tenu ce matin doit pouvoir glisser cet apres-midi.
 */
export function doitGlisserCs(prochaineCsDate: string | undefined, maintenantISO: string): boolean {
  const prochaine = (prochaineCsDate ?? "").slice(0, 10);
  if (!prochaine) return false;
  return prochaine <= maintenantISO.slice(0, 10);
}

/** "2026-09-03" + "2025-09-05" -> "2026-09-03|2025-09-05". */
export function formatGlissementCs(glissee: string, ancienneDerniere: string | undefined): string {
  return `${glissee.slice(0, 10)}|${(ancienneDerniere ?? "").slice(0, 10)}`;
}

/** Inverse de formatGlissementCs. undefined si la valeur est vide ou illisible : sans
 *  date glissee lisible, on prefere ne rien restaurer plutot que d'ecrire n'importe quoi
 *  dans le referentiel partage (meme prudence que parseCloture). */
export function parseGlissementCs(valeur: string | null | undefined): GlissementCs | undefined {
  if (!valeur) return undefined;
  const i = valeur.indexOf("|");
  const glissee = (i < 0 ? valeur : valeur.slice(0, i)).trim();
  const ancienneDerniere = i < 0 ? "" : valeur.slice(i + 1).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(glissee)) return undefined;
  return { glissee, ancienneDerniere };
}
