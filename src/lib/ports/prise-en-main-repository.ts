// Port : "prise en main" d'une copro par son gestionnaire (onboarding). A la premiere
// utilisation, les dates heritees (App A) sont peut-etre fausses. Tant qu'une copro
// n'est pas confirmee, elle reste dans le bac "A prendre en main" et ne declenche
// aucune alarme. Etat persiste dans la table native intranet_copro_prise_en_main.

export interface PriseEnMainRepository {
  /** Codes confirmes (pris en main) parmi `coproCodes`. `null` = fonctionnalite non
   *  disponible (table absente / non deployee) -> a traiter comme "tout pris en main". */
  getConfirmees(coproCodes: string[]): Promise<Set<string> | null>;
  /** Marque une copro comme prise en main. */
  confirmer(coproCode: string, par: string): Promise<void>;
  /** Annule la prise en main (repasse "a prendre en main"). */
  annuler(coproCode: string): Promise<void>;
}
