// Service : definit une date d'AG ou de CS d'une copro (null = deplanifier / effacer).
// `quand` choisit la prochaine (planifiee) ou la derniere (tenue).
// Passe par le routeur (ADR-001). Le scope managerId est applique dans l'adapter.
// `boite` (email du gestionnaire connecte, passe par l'action) sert a la projection
// Outlook automatique de la prochaine date - facultatif, jamais bloquant.

import type { ModeReunion } from "@/lib/domain/confirmation-evenement";
import { getConfirmationEvenementRepository, getCoproRepository } from "@/lib/adapters/router";
import {
  deprojeterEvenementOutlook,
  projeterEvenementOutlook,
} from "@/lib/services/coproprietes/projeter-evenement-outlook";
import {
  deprojeterCreneauxAg,
  projeterCreneauxAg,
} from "@/lib/services/coproprietes/projeter-creneaux-ag";

export async function definirDateEvenement(
  coproCode: string,
  type: "ag" | "cs",
  quand: "prochaine" | "derniere",
  dateISO: string | null,
  managerId: string,
  boite?: string,
  details?: {
    salleEmail?: string | null;
    vehiculeEmail?: string | null;
    modeReunion?: ModeReunion | null;
    /** Emails des collegues associes (deja valides cote action). [] / absent = aucun. */
    collaborateursEmails?: string[];
  },
): Promise<void> {
  await getCoproRepository().setDateEvenement(coproCode, type, quand, dateISO, managerId);
  // (Re)poser la PROCHAINE date la propose au conseil syndical : la confirmation
  // repart "a confirmer" (demande patron). Les dates "derniere" (correction du
  // referentiel) ne sont pas concernees.
  if (quand === "prochaine") {
    const typeConfirmation = type === "ag" ? "AG" : "CS";
    if (dateISO) {
      // La confirmation porte sur le JOUR (pas l'heure) : la table confirmation ne
      // stocke que la date pure, cohérente avec statutPourDate (compare la date).
      await getConfirmationEvenementRepository().proposer(coproCode, typeConfirmation, dateISO.slice(0, 10));
      // Salle + vehicule reserves : persistes AVANT la projection (proposer a cree la
      // ligne, enregistrerRessources la complete) pour que projeterEvenementOutlook les
      // relise et les attache a l'evenement. Degrade propre si colonnes absentes.
      await getConfirmationEvenementRepository().enregistrerRessources(
        coproCode,
        typeConfirmation,
        details?.salleEmail ?? null,
        details?.vehiculeEmail ?? null,
      );
      // Mode de tenue (visio / presentiel / hybride) : UPDATE separe, persiste AVANT la
      // projection pour que projeterEvenementOutlook en deduise le lieu. Degrade propre
      // si la colonne mode_reunion n'est pas encore deployee.
      await getConfirmationEvenementRepository().enregistrerModeReunion(
        coproCode,
        typeConfirmation,
        details?.modeReunion ?? null,
      );
      // Collaborateurs associes : UPDATE separe, persiste AVANT la projection pour que
      // projeterEvenementOutlook les relise et les invite (attendees "required").
      // [] retire tout collegue. Degrade propre si la colonne n'est pas deployee.
      await getConfirmationEvenementRepository().enregistrerCollaborateurs(
        coproCode,
        typeConfirmation,
        details?.collaborateursEmails ?? [],
      );
      // Projection Outlook : cree l'evenement "a confirmer" ou DEPLACE l'existant
      // (replanification). On passe le `debut` COMPLET (date + heure eventuelle).
      // Degrade propre : n'empeche jamais la pose de la date.
      await projeterEvenementOutlook(coproCode, typeConfirmation, dateISO, "a_confirmer", boite);
      // Creneaux de travail derives (regle AG : un CS n'en a pas) : "Mise sous pli"
      // (J-31) et "RELANCE DATE AG" (J-7). Deplacer l'AG les DEPLACE (memes evenements),
      // leurs cibles se recalculent. Degrade propre : jamais bloquant pour la date.
      if (type === "ag") await projeterCreneauxAg(coproCode, dateISO, boite);
    } else {
      // Effacer la date : l'evenement Outlook projete n'a plus lieu d'etre.
      await deprojeterEvenementOutlook(coproCode, typeConfirmation);
      // ... et les creneaux derives non plus (AG uniquement).
      if (type === "ag") await deprojeterCreneauxAg(coproCode);
    }
  }
}
