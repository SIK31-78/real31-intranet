// Service : creer une remontee (bug / idee). L'AUTEUR est deduit de la session par
// l'appelant (server action) et passe ici explicitement - il n'y a AUCUN canal pour
// qu'un client injecte un auteur (la saisie ne porte que type/description/severite/page).
// Passe par le routeur (ADR-001).

import { getFeedbackRepository } from "@/lib/adapters/router";
import { titreParDefaut, type Feedback, type SeveriteFeedback, type TypeFeedback } from "@/lib/domain/feedback";

/** Ce que le collaborateur saisit dans la modale. PAS d'auteur ici : il vient de la session. */
export interface SaisieFeedback {
  type: TypeFeedback;
  description: string;
  severite: SeveriteFeedback;
  /** Pathname capture cote client (page courante). */
  page?: string;
}

/** L'auteur, resolu par le serveur depuis la session (jamais depuis le client). */
export interface AuteurFeedback {
  email?: string;
  initiales?: string;
}

export async function creerFeedback(saisie: SaisieFeedback, auteur: AuteurFeedback): Promise<Feedback> {
  return getFeedbackRepository().creer({
    type: saisie.type,
    description: saisie.description,
    severite: saisie.severite,
    // Le bouton ne capture pas de titre : on le derive, l'admin l'affinera ensuite.
    titre: titreParDefaut(saisie.description),
    ...(saisie.page ? { page: saisie.page } : {}),
    ...(auteur.email ? { auteurEmail: auteur.email } : {}),
    ...(auteur.initiales ? { auteurInitiales: auteur.initiales } : {}),
  });
}
