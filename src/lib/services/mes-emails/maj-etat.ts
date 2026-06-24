// Service : ecritures de l'etat du cockpit "Mes emails". Orchestrateur mince qui
// passe par le routeur (ADR-001) ; le cloisonnement est verifie dans la server action.

import type { Rattachement, StatutTraitement } from "@/lib/domain/mes-emails";
import { getMesEmailsEtatRepository } from "@/lib/adapters/router";

/** Identite + cible commune a toutes les ecritures. */
export type Cible = { gid: string; emailId: string; coproCode: string; initiales: string; email?: string };

function cle(c: Cible) {
  return { gestionnaireId: c.gid, emailId: c.emailId, coproCode: c.coproCode, initiales: c.initiales };
}

export function enregistrerStatut(c: Cible, statut: StatutTraitement, etapesFaites: number[], brouillon?: string) {
  return getMesEmailsEtatRepository().setStatut({
    ...cle(c),
    statut,
    etapesFaites,
    ...(brouillon !== undefined ? { brouillon } : {}),
  });
}
export function enregistrerEtapes(c: Cible, etapesFaites: number[]) {
  return getMesEmailsEtatRepository().setEtapes({ ...cle(c), etapesFaites });
}
export function enregistrerLu(c: Cible) {
  return getMesEmailsEtatRepository().setLu(cle(c));
}
export function enregistrerBrouillon(c: Cible, brouillon: string) {
  return getMesEmailsEtatRepository().setBrouillon({ ...cle(c), brouillon });
}
export function enregistrerRattachement(c: Cible, rattachement: Rattachement) {
  return getMesEmailsEtatRepository().setRattachement({ ...cle(c), rattachement });
}
export function enregistrerCopro(c: Cible, coproNom: string) {
  return getMesEmailsEtatRepository().setCopro({ ...cle(c), coproNom });
}
