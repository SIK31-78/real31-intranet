// Domaine de l'AG Estale (le "Meeting" et ses motions reelles). Source = Estale
// (ADR-024). Types purs. Sert au mode CS pour afficher/editer l'ODJ reel d'une AG.

import type { MajoriteResolution } from "@/lib/domain/resolution";

/** Une motion (resolution) telle qu'elle existe dans l'AG Estale. */
export interface MotionAg {
  /** Id Estale de la motion (cle pour edition/suppression a venir). */
  id: string;
  titre: string;
  majorite: MajoriteResolution;
  /** Cle de repartition (nom), ex "Charges communes generales". */
  cleRepartition?: string;
  /** En-tete de groupe (type Estale "group") : regroupe des sous-resolutions. */
  estGroupe?: boolean;
  /** Sous-resolution rattachee a un groupe (a une motion parente). */
  estEnfant?: boolean;
  /** Id de la motion parente (groupe), si c'est une sous-resolution. */
  parentId?: string;
}

/** Nouvel ordre d'une motion : son id + son rang cible (ex "3" ou "3.1"). */
export interface OrdreMotion {
  motionID: string;
  rank: string;
}

/** L'AG Estale d'une copro + ses motions, dans l'ordre. */
export interface AssembleeAg {
  meetingId: string;
  nom: string;
  /** Date de l'AG (ISO), si fixee. */
  dateISO?: string;
  /** AG cloturee : lecture seule, on ne peut plus modifier les motions. */
  cloturee: boolean;
  motions: MotionAg[];
}

/** Une resolution libre a creer dans l'AG (saisie par le gestionnaire). */
export interface ResolutionLibre {
  titre: string;
  corps: string;
  majorite: MajoriteResolution;
}
