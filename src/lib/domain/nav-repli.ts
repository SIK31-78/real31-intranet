// Preference "sidebar repliee", MEMORISEE PAR MODULE (option C, decision Sekou
// 2026-08-20). Domaine pur : ces fonctions ne lisent ni cookie ni localStorage, elles
// recoivent la chaine brute -> testables, et utilisables des DEUX cotes (le serveur lit
// l'en-tete Cookie, le client lit document.cookie).
//
// Pourquoi un cookie et pas localStorage (correction 2026-08-23) : localStorage est
// invisible du serveur, donc la page s'affichait dans l'etat PAR DEFAUT puis sautait sur
// la preference. Avec un cookie, le rendu serveur connait deja le bon etat : plus de
// saut, et plus d'ecart d'hydratation.

/** Nom du cookie. Pas de point dans le nom : plus sur a manipuler cote document.cookie. */
export const COOKIE_NAV_REPLI = "real31_nav_repli";

/** Un an : la preference d'affichage n'a pas de raison d'expirer plus tot. */
export const MAX_AGE_NAV_REPLI = 60 * 60 * 24 * 365;

/** Modules replies par defaut TANT QUE l'utilisateur n'a rien choisi. Le mail a besoin
 *  de largeur (rail des boites + liste + lecture) ; partout ailleurs, les libelles. */
const REPLI_PAR_DEFAUT = new Set<string>(["emails"]);

/**
 * Format volontairement plat : "emails:1,accueil:0". Pas de JSON -> rien a encoder, rien
 * a echapper, et un cookie illisible ne peut pas casser la page (on rend {} ).
 */
export function analyserRepli(brut: string | undefined | null): Record<string, boolean> {
  const prefs: Record<string, boolean> = {};
  for (const morceau of (brut ?? "").split(",")) {
    const i = morceau.lastIndexOf(":");
    if (i <= 0) continue;
    const cle = morceau.slice(0, i).trim();
    const valeur = morceau.slice(i + 1).trim();
    if (!cle || (valeur !== "0" && valeur !== "1")) continue;
    prefs[cle] = valeur === "1";
  }
  return prefs;
}

export function serialiserRepli(prefs: Record<string, boolean>): string {
  return Object.entries(prefs)
    .map(([cle, v]) => `${cle}:${v ? "1" : "0"}`)
    .join(",");
}

/** Etat replie d'un module : la preference si elle existe, sinon le defaut du module. */
export function repliDuModule(prefs: Record<string, boolean>, module: string): boolean {
  return prefs[module] ?? REPLI_PAR_DEFAUT.has(module);
}

/** Raccourci serveur : du cookie brut a l'etat du module courant. */
export function repliInitial(brutCookie: string | undefined | null, module: string): boolean {
  return repliDuModule(analyserRepli(brutCookie), module);
}

/**
 * Nouvelle valeur du cookie apres bascule d'UN module. Pure (le client n'a plus qu'a
 * poser le resultat dans document.cookie) : la fusion est la partie qui peut se tromper
 * -- effacer la preference des autres modules -- donc c'est elle qu'on teste.
 */
export function fusionnerRepli(
  brutCookie: string | undefined | null,
  module: string,
  repli: boolean,
): string {
  return serialiserRepli({ ...analyserRepli(brutCookie), [module]: repli });
}
