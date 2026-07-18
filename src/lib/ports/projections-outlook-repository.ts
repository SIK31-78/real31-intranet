// Port : memoire des evenements Outlook DERIVES d'une date d'AG (creneaux de travail
// "Mise sous pli" / "RELANCE DATE AG"). Etat persiste dans la table native
// intranet_projections_outlook, une ligne par (copro, role).
//
// POURQUOI une table dediee, et pourquoi la cle N'A PAS de date :
//   intranet_jalons a pour cle (copropriete_id, ag_date, type). Y ranger la projection
//   ferait qu'un deplacement d'AG (15 -> 22) changerait la cle -> nouvelle ligne, et
//   l'evenement Outlook du 15 resterait ORPHELIN (il vit dans Outlook ; l'app ne sait
//   plus qu'il existe) => doublon. Avec (copro_code, role), deplacer l'AG DEPLACE le
//   meme evenement. C'est le point de conception du lot.

import type { RoleCreneauAg } from "@/lib/domain/jalons-ag/creneaux";

export interface ProjectionOutlook {
  coproCode: string;
  role: RoleCreneauAg;
  /** id Graph de l'evenement projete. Absent = aucun evenement en place. */
  outlookEventId?: string;
  /** Email de l'agenda ou vit la projection. Absent = idem. */
  outlookBoite?: string;
}

export interface ProjectionsOutlookRepository {
  /** Projections derivees connues pour la copro (0 a 2 lignes). */
  get(coproCode: string): Promise<ProjectionOutlook[]>;
  /**
   * Pose (eventId + boite) ou efface (null + null) la projection du creneau (copro, role).
   * Renvoie `true` si la memorisation a bien eu lieu, `false` si la persistance a echoue
   * (table absente, erreur d'ecriture). Ce booleen est ESSENTIEL : l'appelant supprime
   * alors l'evenement Graph ORPHELIN qu'il vient de creer -> au pire pas d'evenement,
   * jamais deux.
   */
  enregistrerProjection(
    coproCode: string,
    role: RoleCreneauAg,
    eventId: string | null,
    boite: string | null,
  ): Promise<boolean>;
}
