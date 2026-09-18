// Normalisation des textes du module cles : sans accents, minuscules, un seul espace.
// Sert a l'unicite des entreprises (nom_normalise) et a la recherche tolerante.

/** « ÉCO Sécurité-Incendie  » -> « eco securite incendie ». */
export function normaliserTexte(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Nom d'entreprise normalise pour l'unicite : meme regle, sans espaces internes doubles. */
export function normaliserNomEntreprise(nom: string): string {
  return normaliserTexte(nom);
}

/**
 * Numero de trousseau canonique : « r4 » -> « R004 », « j45 » -> « J045 », « R004 » -> « R004 ».
 * Un numero qui ne suit pas « lettre(s) + chiffres » est rendu tel quel, en majuscules.
 */
export function numeroCanonique(saisie: string): string {
  const s = saisie.trim().toUpperCase();
  const m = s.match(/^([A-Z]{1,2})\s*0*(\d{1,3})$/);
  if (!m) return s;
  return `${m[1]}${m[2].padStart(3, "0")}`;
}
