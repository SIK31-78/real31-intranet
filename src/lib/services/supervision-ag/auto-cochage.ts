// Auto-cochage de la supervision AG depuis les modules Recap AG et Facturation.
// Branchements service -> supervision, sur le modele de conclureAg (qui pose deja
// des dates) : BEST-EFFORT strict. Un echec ici ne doit JAMAIS defaire la facture
// ni le recap qui viennent d'etre crees - on avale l'erreur et on journalise.
//
// Passe par le routeur (ADR-001), jamais un adapter en direct.

import { getSupervisionAgProvider, getCoproRepository } from "@/lib/adapters/router";

/** Id de supervision "CODE__YYYY-MM-DD" (meme convention que partout ailleurs). */
function agId(coproCode: string, agDate: string): string {
  return `${coproCode}__${agDate}`;
}

/**
 * Un recap AG existe = l'item "Récap AG" (apag.recap-reality) de la supervision de
 * CETTE AG est fait. On marque donc apag.recap-reality "ok" sur CODE__agDate.
 */
export async function marquerRecapFait(
  coproCode: string,
  agDate: string,
  initiales: string,
): Promise<void> {
  try {
    await getSupervisionAgProvider().setStatutItem(
      agId(coproCode, agDate),
      "apag.recap-reality",
      "ok",
      { initiales },
    );
  } catch (e) {
    console.warn(
      `[auto-cochage] recap -> apag.recap-reality non marque (${coproCode} ${agDate}) :`,
      (e as Error).message,
    );
  }
}

/**
 * Une facture de depassement CS a ete traitee = l'item "Honoraires CS" (apcs.honos)
 * de l'AG EN PREPARATION de la copro est fait. La supervision "après CS" est celle
 * de la prochaine AG : on cible CODE__{prochaineAg.date}. No-op s'il n'y a pas de
 * prochaine AG planifiee (rien a cocher).
 */
export async function marquerHonorairesCsTraite(
  coproCode: string,
  managerId: string,
  initiales: string,
): Promise<void> {
  try {
    const copro = await getCoproRepository().findByCode(coproCode, managerId);
    const nextAgDate = copro?.prochaineAg?.date;
    if (!nextAgDate) return; // pas d'AG en preparation : rien a cocher
    await getSupervisionAgProvider().setStatutItem(
      agId(coproCode, nextAgDate),
      "apcs.honos",
      "ok",
      { initiales },
    );
  } catch (e) {
    console.warn(
      `[auto-cochage] depassement CS -> apcs.honos non marque (${coproCode}) :`,
      (e as Error).message,
    );
  }
}
