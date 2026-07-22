// Cycle AG de la copro d'une supervision : nourrit la frise du fil d'AG (S1 refonte).
// Le calcul est 100 % domaine (calculerCycleAg = LA source unique) ; ce service ne
// fait que resoudre la copro depuis l'agId et lire l'etat des jalons.

import { calculerCycleAg, type CycleAg } from "@/lib/domain/cycle-ag";
import { agDateDeAgId, coproCodeDeAgId, type StatutAg } from "@/lib/domain/supervision-ag";
import { getCoproRepository, getJalonRepository } from "@/lib/adapters/router";

/**
 * Cycle AG courant de la copro portee par un id de supervision "CODE__YYYY-MM-DD"
 * (ou "CODE" seul : la frise s'affiche quand meme, etat derive de la copro).
 * Renvoie null si la copro est introuvable -> la page supervision garde son
 * comportement actuel, simplement sans frise.
 *
 * L'acces a l'ecran est deja gate par getSupervisionAg (404 sinon) : la copro est
 * lue avec le scope du gestionnaire, avec repli sans scope pour les lectures
 * transverses (encadrement / comptable ouvrant la supervision d'un collegue).
 */
export async function getCycleAgDeSupervision(
  agId: string,
  aujourdhuiISO: string,
  managerId?: string,
  /** Statut de la supervision courante (deja charge par la page) : pilote la
   *  priorisation post-tenue (S2.D). Passe par l'appelant pour eviter un 2e fetch. */
  statutSupervision?: StatutAg,
): Promise<CycleAg | null> {
  const code = coproCodeDeAgId(agId);
  const repo = getCoproRepository();
  const copro = (await repo.findByCode(code, managerId)) ?? (await repo.findByCode(code));
  if (!copro) return null;

  // Jalons du cycle COURANT (prochaine AG). Pour une AG passee/conclue (prochaine
  // videe), repli sur la date portee par l'id : les jalons restent persistes sous
  // (copro, agDate). Sans aucune date, pas de jalons a lire (etat seul).
  const agDate = copro.prochaineAg?.date ?? agDateDeAgId(agId);
  const jalons = agDate ? await getJalonRepository().getJalons(code, agDate) : [];
  const accompli = new Set(
    jalons.filter((j) => j.statut === "accompli").map((j) => j.code as string),
  );
  return calculerCycleAg(copro, accompli, aujourdhuiISO, statutSupervision);
}
