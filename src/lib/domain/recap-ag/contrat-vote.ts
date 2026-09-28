// Nouveau contrat vote en AG : regle de coherence de la saisie du recap.
//
// Le cycle de contrat n'est ouvert que s'il a une date de debut (c'est elle qui borne
// la facturation de gestion courante). Des honoraires saisis SANS date de debut etaient
// perdus en silence : aucun cycle cree, alors que le mail au comptable affichait bien
// le montant (remontee a4c0f7a6). On exige donc le debut des que des honoraires ou un
// forfait de frais postaux sont saisis, a l'ecran comme au serveur (le forfait se perdait
// de la meme facon - extension demandee par Sekou le 28/09).

export interface SaisieContratVote {
  debutContrat?: string;
  honorairesGestionTtc?: number;
  forfaitPostauxTtc?: number;
}

export const MESSAGE_DEBUT_CONTRAT_REQUIS =
  "Des montants sont saisis pour le nouveau contrat : renseigne aussi la date de début du contrat, sinon aucun cycle de contrat n'est ouvert.";

/** Des honoraires ou un forfait postal strictement positifs imposent une date de debut. */
export function debutContratRequis(saisie: SaisieContratVote): boolean {
  return (saisie.honorairesGestionTtc ?? 0) > 0 || (saisie.forfaitPostauxTtc ?? 0) > 0;
}

/** Un nouveau contrat est-il en cours de saisie ? (honoraires ou date de debut renseignes).
 *  Sans lui, le bloc « Nouveau contrat de gestion » est vide et rien n'y est exige. */
export function contratEnSaisie(saisie: SaisieContratVote): boolean {
  return (saisie.honorairesGestionTtc ?? 0) > 0 || Boolean(saisie.debutContrat?.trim());
}

/** Message bloquant si la saisie est incoherente, `null` sinon. */
export function erreurContratVote(saisie: SaisieContratVote): string | null {
  if (debutContratRequis(saisie) && !saisie.debutContrat?.trim()) return MESSAGE_DEBUT_CONTRAT_REQUIS;
  return null;
}
