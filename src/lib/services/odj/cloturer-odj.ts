// Cloture de l'ODJ en "reunion terminee" (demande Sekou 2026-07-28) : le CS preparatoire
// s'est tenu, le document est FIGE et le cycle passe a la supervision AG.
//
// PERIMETRE VOLONTAIREMENT ETROIT (brique 1). La cloture NE diffuse RIEN :
//   - elle ne genere pas de PDF (aucun generateur cote serveur aujourd'hui : le "PDF" de
//     l'ODJ est le rendu navigateur de /odj/<id>/imprimer) ;
//   - elle ne depose rien dans eStale (createFile est prouve mais pas construit : ni port
//     ni adapter, cf. docs/CHANTIER-signature-electronique-AG.md) ;
//   - elle NE COCHE PAS l'item de supervision "apcs.cr-cs-extranet" (Compte rendu CS
//     diffuse sur l'extranet). Le cocher serait MENTIR : rien n'a ete diffuse. C'est au
//     gestionnaire de le cocher quand il a reellement depose le document.
// Quand le depot automatique existera, c'est ICI que le cochage viendra se brancher, sur
// le modele de auto-cochage.ts -- et il sera alors VRAI.
//
// Reversible : rouvrir un ODJ clos par erreur ne coute rien, puisque aucune ecriture
// externe n'a ete engagee.
//
// Passe par le routeur (ADR-001).

import { getOdjRepository } from "@/lib/adapters/router";
import { CLE_CLOTURE_ODJ } from "@/lib/ports/odj-repository";
import { formatCloture } from "@/lib/domain/odj";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";

/**
 * Clot ou rouvre l'ODJ d'une copro pour une date d'AG donnee.
 * `maintenantISO` est injecte (pas de `new Date()` cache dans le service) : le service
 * reste testable et l'horodatage vient d'un seul endroit.
 */
export async function cloturerOdj(params: {
  coproCode: string;
  agDateISO: string;
  clore: boolean;
  initiales: string;
  managerId: string;
  maintenantISO: string;
}): Promise<void> {
  const { coproCode, agDateISO, clore, initiales, managerId, maintenantISO } = params;
  await exigerPerimetre(coproCode, managerId);
  await getOdjRepository().setChamp(
    coproCode,
    agDateISO,
    CLE_CLOTURE_ODJ,
    clore ? formatCloture(maintenantISO, initiales) : null,
    initiales,
  );
}
