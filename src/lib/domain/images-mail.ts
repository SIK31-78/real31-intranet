// Les photos collées dans le corps d'un mail (REA-328, Mylène 15/10/2026). Le corps reste
// affiché en texte (le HTML d'origine, fil cité compris, rendait l'écran illisible : rollback
// du 15/10) ; les images collées s'affichent en vignettes dessous. On écarte les logos et
// bannières de signature : petits, ils se répètent dans chaque mail. Domaine pur.

import type { PieceJointeRef } from "./mes-emails";

/** En dessous, c'est un logo ou une icône de signature, pas une photo. */
export const TAILLE_MIN_IMAGE = 20 * 1024;
/** Une vignette par image, au plus : un fil peut traîner des dizaines de logos. */
export const NB_MAX_IMAGES = 12;

export function imagesDuCorps(inline: PieceJointeRef[]): PieceJointeRef[] {
  return inline.filter((p) => /^image\//i.test(p.type) && p.taille >= TAILLE_MIN_IMAGE).slice(0, NB_MAX_IMAGES);
}
