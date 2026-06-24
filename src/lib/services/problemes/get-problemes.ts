// Service : les problemes signales (items de supervision coches "probleme") du
// perimetre d'un gestionnaire/assistant, groupes par copropriete (decision Sekou).
// Cocher "probleme" sur une fiche -> remonte ici (dashboard + page Actions). Re-cocher
// OK fait disparaitre le probleme (pas de stockage a part). Passe par le routeur (ADR-001).

import { getCoproRepository, getSupervisionAgProvider } from "@/lib/adapters/router";
import { ITEM_LIBELLE } from "@/lib/domain/supervision-ag-template";
import type { ProblemesCopro } from "@/lib/domain/supervision-ag";

const SENTINEL_SANS_DATE = "0001-01-01";

type CoproMin = { code: string; nom: string };

/** Problemes du perimetre, groupes par copro et tries par code copro.
 *  `coprosPreCharges` evite un double fetch quand l'appelant a deja la liste (dashboard). */
export async function getProblemes(
  managerId: string,
  coprosPreCharges?: CoproMin[],
): Promise<ProblemesCopro[]> {
  const copros =
    coprosPreCharges ??
    (await getCoproRepository().list(managerId)).map((c) => ({ code: c.code, nom: c.nom }));
  const nomDe = new Map(copros.map((c) => [c.code, c.nom]));

  const raw = await getSupervisionAgProvider().listerProblemes(copros.map((c) => c.code));

  const parCopro = new Map<string, ProblemesCopro>();
  for (const p of raw) {
    const nom = nomDe.get(p.coproCode);
    if (nom === undefined) continue; // hors perimetre (defense en profondeur)
    const grp =
      parCopro.get(p.coproCode) ?? { coproCode: p.coproCode, coproNom: nom, items: [] };
    grp.items.push({
      agId: p.agDate === SENTINEL_SANS_DATE ? p.coproCode : `${p.coproCode}__${p.agDate}`,
      itemLibelle: ITEM_LIBELLE[p.itemId] ?? p.itemId,
      commentaire: p.commentaire,
      par: p.marquePar,
      le: p.marqueAt,
    });
    parCopro.set(p.coproCode, grp);
  }
  return [...parCopro.values()].sort((a, b) => a.coproCode.localeCompare(b.coproCode));
}
