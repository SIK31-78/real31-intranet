// Domaine pur du dashboard gestionnaire : types metier, zero dependance technique.
// Cf. ADR-001 (architecture hexagonale). Ce fichier ne doit importer que du domaine.

// Primitives partagees (Severite, Ton, Jalon) deplacees dans domain/commun.ts.
import type { Severite, Ton, Jalon } from "@/lib/domain/commun";

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

/** Agregat complet rendu par le dashboard pour un gestionnaire donne. */
export interface DashboardData {
  gestionnaire: Gestionnaire;
  /** Date du jour deja formatee en francais, ex "Mercredi 27 mai 2026". */
  dateCourante: string;
  compteurs: CompteurAction[];
  attention: ItemAttention[];
  activite: ItemActivite[];
}
