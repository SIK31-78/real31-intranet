// Service : editer un contrat = le calculer avec les valeurs choisies, ET en garder la
// trace. Jusqu'au 14/09/2026 l'intranet imprimait sans rien enregistrer : la liste ne
// pouvait pas savoir qu'un contrat existait (etat « genere »), et le recap AG n'avait
// rien a proposer. La trace est ce qui relie generation -> AG -> recap.
//
// Passe par le routeur (ADR-001).

import { getFacturationRepository } from "@/lib/adapters/router";
import type { ChampsContrat } from "@/lib/domain/contrat/champs-contrat";
import { alertesDatesContrat } from "@/lib/domain/contrat/cycle-contrat";
import { preparerContrat, type OptionsContrat } from "./get-contrat";

export interface DemandeEdition extends OptionsContrat {
  coproCode: string;
  /** Qui edite (nom complet), pour l'historique. */
  par: string;
}

/**
 * Calcule le contrat (leve sur toute incoherence : cycle invalide, bareme incomplet,
 * honoraires absents) puis trace l'edition. La trace ne bloque jamais : elle est un
 * confort d'historique, le document, lui, doit sortir.
 */
export async function editerContrat(demande: DemandeEdition): Promise<ChampsContrat> {
  const { coproCode, par, ...options } = demande;
  const { champs, reperes } = await preparerContrat(coproCode, options);
  // Le garde-fou n'empeche pas d'editer (Sekou, 21/10/2026) : on garde la trace de ce que
  // le gestionnaire a passe outre, pour retrouver ces contrats apres coup.
  const alertes = alertesDatesContrat(champs, reperes, new Date().toISOString().slice(0, 10));
  await getFacturationRepository().enregistrerEditionContrat({
    ...(alertes.length > 0 ? { alertes } : {}),
    coproCode,
    dateAgISO: champs.dateAgISO,
    debutISO: champs.debutISO,
    finISO: champs.finISO,
    honorairesGestionTtc: champs.honorairesGestionTtc,
    forfaitPostauxTtc: champs.forfaitPostauxTtc,
    fraisPostauxReels: champs.fraisPostauxReels,
    creePar: par,
  });
  return champs;
}
