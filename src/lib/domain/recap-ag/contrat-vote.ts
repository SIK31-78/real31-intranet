// Nouveau contrat vote en AG : regle de coherence de la saisie du recap.
//
// Le cycle de contrat n'est ouvert que s'il a une date de debut (c'est elle qui borne
// la facturation de gestion courante). Des honoraires saisis SANS date de debut etaient
// perdus en silence : aucun cycle cree, alors que le mail au comptable affichait bien
// le montant (remontee a4c0f7a6). On exige donc le debut des que des honoraires sont
// saisis, a l'ecran comme au serveur.

export interface SaisieContratVote {
  debutContrat?: string;
  honorairesGestionTtc?: number;
}

export const MESSAGE_DEBUT_CONTRAT_REQUIS =
  "Des honoraires sont saisis pour le nouveau contrat : renseigne aussi la date de début du contrat, sinon aucun cycle de contrat n'est ouvert.";

/** Des honoraires strictement positifs imposent une date de debut. */
export function debutContratRequis(saisie: SaisieContratVote): boolean {
  return (saisie.honorairesGestionTtc ?? 0) > 0;
}

/** Message bloquant si la saisie est incoherente, `null` sinon. */
export function erreurContratVote(saisie: SaisieContratVote): string | null {
  if (debutContratRequis(saisie) && !saisie.debutContrat?.trim()) return MESSAGE_DEBUT_CONTRAT_REQUIS;
  return null;
}
