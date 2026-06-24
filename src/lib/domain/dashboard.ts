// Domaine pur du dashboard gestionnaire : types metier, zero dependance technique.
// Cf. ADR-001 (architecture hexagonale). Ce fichier ne doit importer que du domaine.

// Primitives partagees (Severite, Ton, Jalon) deplacees dans domain/commun.ts.
import type { Severite, Ton, Jalon } from "@/lib/domain/commun";
import type { JalonCode } from "@/lib/domain/jalons-ag/types";
import type { EtatCycle } from "@/lib/domain/etat-cycle-ag";
import type { ProblemesCopro } from "@/lib/domain/supervision-ag";
import type { ActionsDossierCopro } from "@/lib/domain/dossier";

/** Une colonne du pipeline des AG (cockpit) : un etat du cycle + son compteur. */
export interface PipelineEtat {
  etat: EtatCycle;
  count: number;
  /** Sous-ensemble en retard (delai legal depasse) - pertinent pour a_planifier. */
  enRetard: number;
}

export interface Gestionnaire {
  id: string;
  /** Nom complet affiche dans le bandeau, ex "Élise Lambert". */
  nomComplet: string;
  /** Initiales pour l'avatar, ex "EL". */
  initiales: string;
}

/**
 * Chiffre actionnable du haut de page. Volontairement different d'une "vanity metric" :
 * la valeur represente une pile de choses A FAIRE, pas un total a contempler.
 */
export interface CompteurAction {
  id: string;
  /** Eyebrow, ex "À envoyer". */
  label: string;
  valeur: number;
  /** Unite a cote du chiffre, ex "convocations". */
  unite: string;
  /** Contexte discret, ex "cette semaine". */
  detail: string;
  /** Fragment mis en avant dans le detail, ex "1 en retard". */
  detailFort?: string;
  /** Severite qui colore le fragment detailFort. */
  severiteDetail?: Severite;
  /** Nom d'icone lucide, ex "send". */
  icone: string;
  /** Lien vers la vue concernee (carte cliquable). */
  lien?: string;
}

/** Une ligne de la liste "Ce qui demande votre attention", triee par urgence. */
export interface ItemAttention {
  id: string;
  jalon: Jalon;
  /** Code copro, ex "S104". */
  coproCode: string;
  /** Intitule de la tache, ex "Résidence Les Marronniers - convocation en retard". */
  titre: string;
  /** Echeance courte, ex "29/05". Absente pour les taches sans date ferme. */
  echeance?: string;
  /** Badge optionnel de statut, ex "Légal dépassé". */
  badge?: { texte: string; ton: Ton };
  /** Lien vers la preparation concernee (ligne cliquable). */
  lien?: string;
  /** Echeance passee non confirmee (geree dans Estale ?) : etat neutre + action 1 clic. */
  aConfirmer?: boolean;
  /** Jalon + AG vises, pour le bouton "marquer fait" (present si aConfirmer). */
  jalonCode?: JalonCode;
  agDate?: string;
}

/** Une entree du flux d'activite recente (lecture seule). */
export interface ItemActivite {
  id: string;
  /** Nom d'icone lucide, ex "file-check". */
  icone: string;
  tonIcone?: Ton;
  /** Description courte, ex "PV de l'AG publié". */
  texte: string;
  coproCode?: string;
  /** Horodatage humain, ex "il y a 2 h". */
  quand: string;
}

// --- Parcours AG (sequence guidee : Dates -> ODJ -> Convoc -> Tenue -> PV) --

/** Les cinq etapes du cycle de preparation d'une AG, dans l'ordre. */
export type CodeEtape = "dates" | "odj" | "convoc" | "tenue" | "pv";

/** Etat d'une etape pour une copro donnee : faite, en cours (etape actuelle), a venir. */
export type StatutEtape = "fait" | "encours" | "avenir";

export interface EtapeParcours {
  code: CodeEtape;
  /** Libelle court affiche sous le jalon, ex "ODJ". */
  label: string;
  statut: StatutEtape;
}

/**
 * Une ligne du parcours : une copro en cycle AG, sa progression sur les 5 etapes,
 * et sa prochaine action concrete. Pensee pour qu'un junior voie "j'en suis ou,
 * je fais quoi ensuite" sans connaitre le process par coeur.
 */
export interface LigneParcours {
  id: string;
  coproCode: string;
  coproNom: string;
  /** Toujours 5 etapes, dans l'ordre. */
  etapes: EtapeParcours[];
  /** Phrase d'action, ex "preparer l'ODJ". */
  prochaineAction: string;
  /** Texte du bouton, ex "ODJ", "Fixer", "Supervision". */
  actionLabel: string;
  /** Cible du bouton. */
  lien: string;
  /** Echeance courte de l'etape courante, ex "J-30", "à dater". */
  echeance?: string;
  /** Vrai si l'echeance de l'etape courante est depassee. */
  enRetard?: boolean;
  /** Cloture de l'exercice comptable "JJ/MM" (sert au filtre du dashboard). */
  exerciceCloture?: string;
}

/** Agregat complet rendu par le dashboard pour un gestionnaire donne. */
export interface DashboardData {
  gestionnaire: Gestionnaire;
  /** Date du jour deja formatee en francais, ex "Mercredi 27 mai 2026". */
  dateCourante: string;
  compteurs: CompteurAction[];
  attention: ItemAttention[];
  activite: ItemActivite[];
  /** Parcours AG guide. Optionnel : present en mode supabase, absent en mock. */
  parcours?: LigneParcours[];
  /** Pipeline des AG (cockpit) : compteur par etat du cycle. Present en mode supabase. */
  pipeline?: PipelineEtat[];
  /** Nb de copros pas encore prises en main (onboarding) : exclues des alarmes. */
  aPrendreEnMain?: number;
  /** Problemes signales (items "probleme"), groupes par copro. Remplace "Activite recente". */
  problemes?: ProblemesCopro[];
  /** Prochaine etape de chaque dossier ouvert, groupee par copro (C3). Mode supabase. */
  actionsDossiers?: ActionsDossierCopro[];
}
