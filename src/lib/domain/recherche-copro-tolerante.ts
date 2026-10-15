// Recherche tolérante d'une copropriété (REA-327, 15/10/2026). Crypto écrit « STMARTIN » en
// un mot, l'équipe tape « St Martin » ou « Saint-Martin », ou cherche par la ville : on
// compare sans accents, sans espaces ni ponctuation, « saint » valant « st », et le code
// sans ses zéros (S109 = S0109). Domaine pur.

export interface CoproCherchable {
  reference: string;
  nom: string;
  /** Adresse sur une ligne, ville comprise ; "" si inconnue. */
  adresse: string;
}

/** Le texte réduit à ce qui compte pour comparer : minuscules, sans accents ni séparateurs, saint = st. */
export function cleRecherche(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(sainte?|ste)\b/g, "st")
    .replace(/[^a-z0-9]/g, "");
}

/** « S0109 », « s109 », « 109 » -> « s109 » ; null si ce n'est pas un code. */
function cleCode(texte: string): string | null {
  const m = /^\s*(se|s)?\s*0*(\d{1,4})\s*$/i.exec(texte);
  return m ? `${(m[1] ?? "s").toLowerCase()}${m[2]}` : null;
}

export function coproCorrespond(c: CoproCherchable, recherche: string): boolean {
  const q = cleRecherche(recherche);
  if (!q) return false;
  const code = cleCode(recherche);
  if (code && cleCode(c.reference) === code) return true;
  return cleRecherche(`${c.reference} ${c.nom} ${c.adresse}`).includes(q);
}

/** Les copros qui correspondent, dans l'ordre donné, au plus `max`. */
export function chercherCopros<T extends CoproCherchable>(copros: T[], recherche: string, max = 8): T[] {
  return recherche.trim() ? copros.filter((c) => coproCorrespond(c, recherche)).slice(0, max) : [];
}

/** Une copro où envoyer un mail rangé à tort (REA-327) : avec son gestionnaire au mandat. */
export interface CoproDestination extends CoproCherchable {
  gestionnaire: string | null;
}
