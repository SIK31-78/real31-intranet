// Port (contrat) des remontees collaborateurs (table native intranet_feedback).
// Ne depend que du domaine. La confidentialite est portee par `listerPublic` (bornee
// aux statuts publics) + la projection domaine `versEntreePublique` cote service.

import type {
  Feedback,
  SeveriteFeedback,
  StatutFeedback,
  TypeFeedback,
} from "@/lib/domain/feedback";

/** Ce qu'on ecrit a la creation. L'auteur vient de la SESSION (jamais du client). */
export interface RemonteeFeedback {
  type: TypeFeedback;
  /** Titre court (derive de la description par le service a la creation). */
  titre: string;
  description: string;
  severite: SeveriteFeedback;
  /** Pathname capture (ex "/copropriete/S104"). */
  page?: string;
  auteurEmail?: string;
  auteurInitiales?: string;
}

/** Filtre du triage admin (facultatif, cumulable). */
export interface FiltreFeedback {
  statut?: StatutFeedback;
  type?: TypeFeedback;
  severite?: SeveriteFeedback;
}

/** Options d'un changement de statut (validees en amont par le domaine). */
export interface ChangementStatut {
  /** Requis quand le statut cible est `ecarte` (regle domaine). */
  raisonEcart?: string;
  /** Email / initiales de l'admin qui agit (audit). */
  par?: string;
  /** ISO ; pose quand le statut cible est `livre` (date du changelog). */
  livreAt?: string;
}

/** Edition admin d'une remontee (titre / priorite / note interne). */
export interface PatchFeedback {
  titre?: string;
  /** null efface la priorite ; undefined = ne pas toucher. */
  priorite?: number | null;
  noteInterne?: string;
}

export interface FeedbackRepository {
  /** Cree la remontee (statut initial `nouveau`) et renvoie l'enregistrement. */
  creer(remontee: RemonteeFeedback): Promise<Feedback>;
  /** Toutes les remontees (tous statuts), plus recente en premier. Filtre optionnel. */
  lister(filtre?: FiltreFeedback): Promise<Feedback[]>;
  /** Une remontee par id. null = inconnue. */
  get(id: string): Promise<Feedback | null>;
  /** Change le statut (la validite de la transition est verifiee AVANT, par le service).
   *  Touche updated_at ; pose livre_at si fourni. null = introuvable. */
  changerStatut(id: string, statut: StatutFeedback, opts: ChangementStatut): Promise<Feedback | null>;
  /** Edite titre / priorite / note interne. Touche updated_at. null = introuvable. */
  patch(id: string, patch: PatchFeedback): Promise<Feedback | null>;
  /** Uniquement les statuts VISIBLES du public (prevu / en_cours / livre), pour /nouveautes. */
  listerPublic(): Promise<Feedback[]>;
}
