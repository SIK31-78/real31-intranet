/** Validation du nom de local (G-4 durci par H-5). */

/**
 * Un nom de local est valide s'il contient au moins un caractère alphanumérique.
 * Rejette les valeurs vides, en blancs, ou composées uniquement de ponctuation
 * (ex. « ,,,, »).
 */
export function nomLocalValide(nom: string): boolean {
  return /[\p{L}\p{N}]/u.test(nom);
}
