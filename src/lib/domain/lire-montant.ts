// LE lecteur de montant saisi a la main (REA-99). Les gestionnaires tapent les montants
// comme ils les lisent : « 12 500 », « 12 500,50 € », parfois colles depuis Excel ou un
// PDF avec une espace insecable. Un `Number("12 500")` rend NaN, et le formulaire
// refusait la saisie sans dire pourquoi. Tout champ montant passe donc par ici.
// Fonction pure.

/**
 * Lit un montant saisi. Accepte les espaces (ordinaires, insecables, fines) entre les
 * milliers, le symbole « € », la virgule ou le point decimal, et le point comme separateur
 * de milliers quand une virgule decimale suit (« 12.500,50 »).
 * Rend `null` si la saisie est vide ou illisible (jamais 0 par defaut : « abc » n'est
 * pas un montant nul).
 */
export function lireMontant(brut: string | number | null | undefined): number | null {
  if (typeof brut === "number") return Number.isFinite(brut) ? brut : null;
  if (brut == null) return null;
  // \s couvre l'espace insecable (U+00A0) et l'espace fine (U+202F) d'Intl.
  let s = brut.replace(/[\s€]/g, "").replace(/EUR$/i, "");
  if (s === "") return null;
  if (s.includes(",")) {
    // Virgule decimale : les points eventuels sont des separateurs de milliers.
    if (s.indexOf(",") !== s.lastIndexOf(",")) return null;
    s = s.replace(/\./g, "").replace(",", ".");
  }
  // Pas de notation scientifique ni d'hexadecimal : un montant, rien d'autre.
  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
