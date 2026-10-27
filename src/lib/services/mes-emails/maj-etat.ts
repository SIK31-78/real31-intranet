// Service : ecritures de l'etat du cockpit "Mes emails". Orchestrateur mince qui
// passe par le routeur (ADR-001) ; le cloisonnement est verifie dans la server action.

import type { Rattachement, StatutTraitement } from "@/lib/domain/mes-emails";
import { getMesEmailsEtatRepository } from "@/lib/adapters/router";
import { cleEtatBoite } from "@/lib/services/mes-emails/statut-partage";

/** Identite + cible commune a toutes les ecritures. */
export type Cible = {
  gid: string;
  emailId: string;
  coproCode: string;
  initiales: string;
  email?: string;
  /** Boite PARTAGEE qui a recu le mail : son statut y est aussi ecrit, pour tous. */
  boitePartagee?: string;
};

function cle(c: Cible) {
  return { gestionnaireId: c.gid, emailId: c.emailId, coproCode: c.coproCode, initiales: c.initiales };
}

export async function enregistrerStatut(c: Cible, statut: StatutTraitement, etapesFaites: number[], brouillon?: string) {
  const repo = getMesEmailsEtatRepository();
  await repo.setStatut({
    ...cle(c),
    statut,
    etapesFaites,
    ...(brouillon !== undefined ? { brouillon } : {}),
  });
  // Boite partagee : la ligne commune porte le statut pour tous ceux qui la voient.
  if (c.boitePartagee) {
    await repo.setStatut({ ...cle(c), gestionnaireId: cleEtatBoite(c.boitePartagee), statut, etapesFaites });
  }
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
export function enregistrerDossier(c: Cible, dossierId: string, dossierNom: string) {
  return getMesEmailsEtatRepository().setDossier({ ...cle(c), dossierId, dossierNom });
}
