// Service : creer une entree « maison » (nouveaute / roadmap) directement au statut
// choisi. C'est le pendant admin du bouton collaborateur (creerFeedback) : ici le TITRE
// est fourni, le STATUT est choisi, la severite/description/priorite sont optionnelles.
// L'AUTEUR est deduit de la session par l'appelant (server action) et passe explicitement -
// aucun canal ne permet a un client d'injecter un auteur. Passe par le routeur (ADR-001).

import { getFeedbackRepository } from "@/lib/adapters/router";
import {
  livreAtCreation,
  type Feedback,
  type SeveriteFeedback,
  type StatutCreationAdmin,
  type TypeFeedback,
} from "@/lib/domain/feedback";
import type { AuteurFeedback } from "./creer-feedback";

/** Ce que le super-admin saisit dans le formulaire « Ajouter une entree ». */
export interface SaisieEntreeAdmin {
  type: TypeFeedback;
  titre: string;
  /** Statut de naissance (borne par le domaine : jamais `ecarte`). */
  statut: StatutCreationAdmin;
  /** Interne, facultative. */
  description?: string;
  /** Facultative (une entree « maison » n'a en general pas de severite). */
  severite?: SeveriteFeedback;
  priorite?: number;
}

export async function creerEntreeAdmin(saisie: SaisieEntreeAdmin, auteur: AuteurFeedback): Promise<Feedback> {
  // livre_at pose UNIQUEMENT si l'entree naît directement `livre` (date du changelog).
  const livreAt = livreAtCreation(saisie.statut);
  return getFeedbackRepository().creerEntree({
    type: saisie.type,
    titre: saisie.titre,
    statut: saisie.statut,
    ...(saisie.description ? { description: saisie.description } : {}),
    ...(saisie.severite ? { severite: saisie.severite } : {}),
    ...(saisie.priorite != null ? { priorite: saisie.priorite } : {}),
    ...(auteur.email ? { auteurEmail: auteur.email } : {}),
    ...(auteur.initiales ? { auteurInitiales: auteur.initiales } : {}),
    ...(livreAt ? { livreAt } : {}),
  });
}
