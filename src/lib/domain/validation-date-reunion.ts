// Garde-fous "doux" a la saisie d'une date de reunion AG / CS. Logique PURE
// (domaine, ADR-001) : comparaisons de chaines 'YYYY-MM-DD' (jamais `new Date`,
// pour eviter tout decalage de fuseau). On AVERTIT, on ne bloque pas : une
// prochaine reunion dans le passe (ou une derniere dans le futur) est le plus
// souvent une faute de frappe, mais reste parfois legitime (saisie de rattrapage).

/**
 * Message d'avertissement pour une date de reunion incoherente, sinon null.
 *   - "prochaine" dans le passe : probable erreur de saisie (reunion deja passee).
 *   - "derniere" dans le futur : une reunion tenue ne peut pas etre a venir.
 * `dateISO` et `todayISO` sont au format 'YYYY-MM-DD' (comparaison lexicographique).
 * Le JOUR meme n'est jamais signale (ni passe, ni futur).
 */
export function avertissementDateReunion(
  quand: "prochaine" | "derniere",
  dateISO: string,
  todayISO: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return null;
  if (quand === "prochaine" && dateISO < todayISO)
    return "Cette date est déjà passée - vérifiez qu'il s'agit bien de la prochaine réunion.";
  if (quand === "derniere" && dateISO > todayISO)
    return "Cette date est dans le futur - une réunion déjà tenue ne peut pas être à venir.";
  return null;
}
