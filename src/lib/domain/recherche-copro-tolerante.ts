// Recherche tolérante d'une copropriété (REA-327, 15/10/2026). Crypto écrit « STMARTIN » en
// un mot, l'équipe tape « St Martin » ou « Saint-Martin », ou cherche par la ville : on
// compare sans accents, sans espaces ni ponctuation, « saint » valant « st », et le code
// sans ses zéros (S109 = S0109). Domaine pur.
// Par un copropriétaire (28/10/2026) : « Dupont » trouve la ou les copros où il a un lot, et le
// résultat dit pourquoi (« Dupont Jean · copropriétaire »).
// Par un client des copros Crypto (03/11/2026) : les noms viennent aussi de l'annuaire Crypto
// (copropriétaires, conseil syndical, locataires ; jamais les professionnels), et une adresse
// e-mail tapée (« dupont@… ») trouve la copro de cette adresse. Les adresses restent côté
// serveur (index des expéditeurs, ~300 Ko pour syndic2) : le serveur répond par une action,
// la vue fusionne avec avecTrouveesParEmail.

import type { QualiteExpediteur } from "./tri-emails";

export interface CoproCherchable {
  reference: string;
  nom: string;
  /** Adresse sur une ligne, ville comprise ; "" si inconnue. */
  adresse: string;
  /**
   * Noms des copropriétaires (ESTALE, « Dupont Jean » ; Crypto, conseil syndical compris) ;
   * absent si la source ne les donne pas.
   */
  coproprietaires?: string[];
  /** Noms des locataires (annuaire Crypto, 03/11/2026) ; absent si la source ne les donne pas. */
  locataires?: string[];
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

/**
 * Une copro trouvée. `coproprietaireTrouve` = le nom (copropriétaire ou locataire) qui l'a fait
 * sortir, si c'est par lui ; `raisonTrouvee` = ce que l'écran affiche à côté
 * (« Dupont Jean · copropriétaire », « dupont@exemple.fr · locataire »).
 */
export type CoproTrouvee<T> = T & { coproprietaireTrouve?: string; raisonTrouvee?: string };

/**
 * Les copros qui correspondent, dans l'ordre donné, au plus `max` : d'abord par code, nom ou
 * adresse, puis par le nom d'un de leurs copropriétaires ou locataires (3 lettres au moins).
 */
export function chercherCopros<T extends CoproCherchable>(copros: T[], recherche: string, max = 8): CoproTrouvee<T>[] {
  if (!recherche.trim()) return [];
  const directes = copros.filter((c) => coproCorrespond(c, recherche)).slice(0, max);
  if (directes.length >= max) return directes;
  const parNom: CoproTrouvee<T>[] = [];
  for (const c of copros) {
    if (directes.length + parNom.length >= max) break;
    if (directes.includes(c)) continue;
    const proprio = c.coproprietaires?.find((n) => nomCorrespond(n, recherche));
    const locataire = proprio ? undefined : c.locataires?.find((n) => nomCorrespond(n, recherche));
    const nom = proprio ?? locataire;
    if (nom) parNom.push({ ...c, coproprietaireTrouve: nom, raisonTrouvee: `${nom} · ${proprio ? "copropriétaire" : "locataire"}` });
  }
  return [...directes, ...parNom];
}

// --- Par l'adresse e-mail d'un client (03/11/2026) ---------------------------------------

/** Une adresse ne se cherche qu'à partir de 5 caractères : « du@ » en sortirait des dizaines. */
export const MIN_RECHERCHE_EMAIL = 5;

/**
 * Les qualités qui font trouver une copro par l'adresse : ses clients. Jamais un fournisseur,
 * un notaire ou un mandataire : un plombier ne doit pas faire sortir 40 copros.
 */
const QUALITES_CLIENT: ReadonlySet<QualiteExpediteur> = new Set<QualiteExpediteur>(["copropriétaire", "conseil syndical", "locataire"]);

/**
 * Le début d'adresse à chercher (minuscules, sans espaces autour) si la recherche ressemble à
 * une adresse e-mail : elle contient « @ », ou elle a la forme « jean.dupont » (mots collés par
 * des points, sans espace). null sinon, ou si elle est trop courte.
 */
export function debutEmailRecherche(recherche: string): string | null {
  const q = recherche.trim().toLowerCase();
  if (q.length < MIN_RECHERCHE_EMAIL || /\s/.test(q)) return null;
  if (/^[^@]+@[^@]*$/.test(q)) return q;
  return /^[a-z0-9_+-]*[a-z][a-z0-9_+-]*(\.[a-z0-9_+-]+)+$/.test(q) ? q : null;
}

/** Une copro trouvée par l'adresse d'un de ses clients. */
export interface TrouveeParEmail {
  reference: string;
  email: string;
  qualite: QualiteExpediteur;
}

/**
 * Les copros des adresses qui COMMENCENT par la recherche (index des expéditeurs : adresse en
 * minuscules -> copros), clients seulement, une ligne par copro, au plus `max`. L'adresse
 * exacte passe d'abord, puis l'ordre alphabétique.
 */
export function coprosParEmail(
  expediteurs: Record<string, { reference: string; qualite: QualiteExpediteur }[]>,
  recherche: string,
  max = 8,
): TrouveeParEmail[] {
  const q = debutEmailRecherche(recherche);
  if (!q) return [];
  const adresses = Object.keys(expediteurs)
    .filter((e) => e.startsWith(q))
    .sort((a, b) => Number(b === q) - Number(a === q) || a.localeCompare(b));
  const trouvees: TrouveeParEmail[] = [];
  for (const email of adresses) {
    for (const l of expediteurs[email] ?? []) {
      if (trouvees.length >= max) return trouvees;
      if (!QUALITES_CLIENT.has(l.qualite) || trouvees.some((t) => t.reference === l.reference)) continue;
      trouvees.push({ reference: l.reference, email, qualite: l.qualite });
    }
  }
  return trouvees;
}

/**
 * Les copros trouvées par l'adresse d'abord (la recherche est une adresse : c'est ce qu'on
 * cherche), puis celles de chercherCopros, sans doublon, au plus `max`. Une référence absente
 * de `copros` est ignorée.
 */
export function avecTrouveesParEmail<T extends CoproCherchable>(
  trouvees: CoproTrouvee<T>[],
  copros: T[],
  parEmail: TrouveeParEmail[],
  max = 8,
): CoproTrouvee<T>[] {
  if (!parEmail.length) return trouvees;
  const parRef = new Map(copros.map((c) => [c.reference, c]));
  const resultat: CoproTrouvee<T>[] = [];
  for (const t of parEmail) {
    const c = parRef.get(t.reference);
    if (c && !resultat.some((r) => r.reference === c.reference)) resultat.push({ ...c, raisonTrouvee: `${t.email} · ${t.qualite}` });
  }
  for (const c of trouvees) if (!resultat.some((r) => r.reference === c.reference)) resultat.push(c);
  return resultat.slice(0, max);
}

/** Une copro où envoyer un mail rangé à tort (REA-327) : avec son gestionnaire au mandat. */
export interface CoproDestination extends CoproCherchable {
  gestionnaire: string | null;
}
