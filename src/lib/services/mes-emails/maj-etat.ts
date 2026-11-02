// Service : ecritures de l'etat du cockpit "Mes emails". Orchestrateur mince qui
// passe par le routeur (ADR-001) ; le cloisonnement est verifie dans la server action.

import type { Rattachement, StatutTraitement } from "@/lib/domain/mes-emails";
import { getMailboxProvider, getMesEmailsEtatRepository } from "@/lib/adapters/router";
import { signalerException } from "@/lib/observabilite";
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
/** Pose (`lu` vrai) ou efface (`lu` faux, « Marquer non lu » du 02/11/2026) le lu intranet. */
export function enregistrerLu(c: Cible, lu: boolean) {
  return getMesEmailsEtatRepository().setLu({ ...cle(c), lu });
}

/**
 * Le « lu » de l'intranet, ecrit aussi dans Outlook (REA-422, 27/10/2026) : on lit un mail
 * dans l'un ou l'autre outil, il est lu dans les deux. Jamais bloquant : un refus de Graph
 * (droits, mail deplace entre-temps) est journalise, l'etat intranet reste pose a cote.
 * `lu` faux = remis en non lu (02/11/2026). Rend false si Outlook n'a pas suivi : « Marquer
 * non lu » le dit a l'ecran (sinon le mail redeviendrait lu a la prochaine actualisation).
 */
export async function marquerLuDansOutlook(boite: string, internetMessageId: string, lu: boolean): Promise<boolean> {
  try {
    await getMailboxProvider().marquerLu({ boite, internetMessageId, lu });
    return true;
  } catch (err) {
    console.warn(`[mes-emails] ${lu ? "lu" : "non lu"} non reporte dans Outlook (${boite}) :`, err instanceof Error ? err.message : err);
    signalerException(err, { source: "mes-emails-lu", detail: { boite, lu } });
    return false;
  }
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
