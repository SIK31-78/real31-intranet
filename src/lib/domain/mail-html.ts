// Affichage d'un mail en HTML (REA-328, Mylène 15/10/2026 : les photos collées dans le corps
// ne se voyaient pas). Le HTML d'origine s'affiche dans une iframe sans script ni formulaire ;
// ici on prépare ce HTML. Domaine pur.
//
// - Les images « cid: » (collées dans le corps) deviennent des data URI à partir des pièces
//   jointes inline : l'iframe sandboxée n'a pas d'origine, elle n'enverrait pas le cookie de
//   session à une route de l'intranet, alors qu'une data URI s'affiche sans requête.
// - Les images hébergées à l'extérieur s'affichent d'office (décision de Sekou du 15/10/2026).
// - Les liens s'ouvrent dans un nouvel onglet (<base target="_blank">).

export interface ImageInline {
  /** Content-ID de la pièce jointe, sans chevrons. */
  contentId: string;
  type: string;
  base64: string;
}

/** Au-delà, les images inline restantes ne sont pas embarquées (page trop lourde). */
export const TAILLE_MAX_INLINE = 8 * 1024 * 1024;

const sansChevrons = (id: string) => id.trim().replace(/^<|>$/g, "").toLowerCase();

/** Le HTML prêt pour l'iframe : images cid: remplacées, liens vers un nouvel onglet. */
export function htmlAffichable(html: string, inline: ImageInline[], max = TAILLE_MAX_INLINE): string {
  const parId = new Map<string, string>();
  let total = 0;
  for (const i of inline) {
    if (!i.base64 || !/^image\//i.test(i.type)) continue;
    total += i.base64.length;
    if (total > max) break;
    parId.set(sansChevrons(i.contentId), `data:${i.type};base64,${i.base64}`);
  }
  const corps = html.replace(/(["'(])cid:([^"')\s]+)/gi, (tout, avant: string, id: string) => {
    const uri = parId.get(sansChevrons(decodeURIComponent(id)));
    return uri ? `${avant}${uri}` : tout;
  });
  const base = '<base target="_blank">';
  return /<head[^>]*>/i.test(corps) ? corps.replace(/<head[^>]*>/i, (h) => `${h}${base}`) : `${base}${corps}`;
}
