// Recherche tolérante d'une copropriété (REA-327, 15/10/2026). Crypto écrit « STMARTIN » en
// un mot, l'équipe tape « St Martin » ou « Saint-Martin », ou cherche par la ville : on
// compare sans accents, sans espaces ni ponctuation, « saint » valant « st », et le code
// sans ses zéros (S109 = S0109). Domaine pur.
// Par un copropriétaire (28/10/2026) : « Dupont » trouve la ou les copros où il a un lot, et le
// résultat dit pourquoi (« Dupont Jean · copropriétaire »).

export interface CoproCherchable {
  reference: string;
  nom: string;
  /** Adresse sur une ligne, ville comprise ; "" si inconnue. */
  adresse: string;
  /** Noms des copropriétaires (ESTALE, « Dupont Jean ») ; absent si la source ne les donne pas. */
  coproprietaires?: string[];
}

/** Un nom de copropriétaire ne se cherche qu'à partir de 3 lettres : « du » en sortirait des dizaines. */
export const MIN_RECHERCHE_NOM = 3;

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

/** Les mots d'un nom ou d'une recherche, chacun réduit par cleRecherche : « Le Goff-Ménard » -> le, goff, menard. */
function motsDe(texte: string): string[] {
  return texte.split(/[^\p{L}\p{M}\p{N}]+/u).map(cleRecherche).filter(Boolean);
}

/**
 * Le nom d'un copropriétaire correspond-il ? Chaque mot cherché doit COMMENCER un mot du nom,
 * dans n'importe quel ordre (« jean dup » trouve « Dupont Jean ») ; ou la recherche collée
 * commence le nom à partir d'un de ses mots (« legoff » trouve « Le Goff Anne »). Pas de
 * sous-chaîne au milieu d'un mot : « ont » ne doit pas sortir tous les Dupont.
 */
export function nomCorrespond(nom: string, recherche: string): boolean {
  const q = motsDe(recherche);
  const colle = q.join("");
  if (colle.length < MIN_RECHERCHE_NOM) return false;
  const mots = motsDe(nom);
  if (q.every((t) => mots.some((m) => m.startsWith(t)))) return true;
  return mots.some((_, i) => mots.slice(i).join("").startsWith(colle));
}

/** Une copro trouvée ; `coproprietaireTrouve` = le copropriétaire qui l'a fait sortir, si c'est par lui. */
export type CoproTrouvee<T> = T & { coproprietaireTrouve?: string };

/**
 * Les copros qui correspondent, dans l'ordre donné, au plus `max` : d'abord par code, nom ou
 * adresse, puis par le nom d'un de leurs copropriétaires (3 lettres au moins).
 */
export function chercherCopros<T extends CoproCherchable>(copros: T[], recherche: string, max = 8): CoproTrouvee<T>[] {
  if (!recherche.trim()) return [];
  const directes = copros.filter((c) => coproCorrespond(c, recherche)).slice(0, max);
  if (directes.length >= max) return directes;
  const parNom: CoproTrouvee<T>[] = [];
  for (const c of copros) {
    if (directes.length + parNom.length >= max) break;
    if (directes.includes(c)) continue;
    const nom = c.coproprietaires?.find((n) => nomCorrespond(n, recherche));
    if (nom) parNom.push({ ...c, coproprietaireTrouve: nom });
  }
  return [...directes, ...parNom];
}

/** Une copro où envoyer un mail rangé à tort (REA-327) : avec son gestionnaire au mandat. */
export interface CoproDestination extends CoproCherchable {
  gestionnaire: string | null;
}
