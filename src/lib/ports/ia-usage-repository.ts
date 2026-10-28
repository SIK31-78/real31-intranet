// Port du journal d'usage de l'IA (table intranet_ia_usage, 28/10/2026, ADR-051) : qui, quand,
// quelle fonction, quel modèle, combien de tokens, combien de dollars, combien de temps, et
// comment ça s'est fini. JAMAIS le texte du mail. Sert au suivi du budget (les crédits API
// s'arrêtent net une fois épuisés) et au plafond quotidien par personne.

export interface LigneUsageIa {
  /** « reformulation » pour l'instant. */
  fonction: string;
  gestionnaireId: string;
  initiales: string;
  /** Vrai si l'appel a été fait dans la peau d'un collègue (« Changer de gestionnaire »). */
  incarnation: boolean;
  modele: string;
  tokensEntree: number;
  tokensSortie: number;
  /** En dollars, null pour un modèle au prix inconnu. */
  coutEstime: number | null;
  dureeMs: number;
  /** La reformulation a remplacé le texte. */
  succes: boolean;
  /** Code court (« delai », « controle:chiffres_perdus »...), jamais un contenu. */
  erreur: string | null;
  /** Jour à Paris (AAAA-MM-JJ) : la clé du plafond quotidien. */
  jour: string;
}

export interface IaUsageRepository {
  enregistrer(ligne: LigneUsageIa): Promise<void>;
  /** Appels de la personne ce jour-là pour cette fonction ; null si le journal n'existe pas encore. */
  compterDuJour(gestionnaireId: string, fonction: string, jour: string): Promise<number | null>;
}
