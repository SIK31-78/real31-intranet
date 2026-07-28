// Port (contrat) de l'etat de l'ODJ. Le squelette (sections, champs, points
// legaux) vit en code ; ici on ne persiste que ce que le gestionnaire saisit :
// valeurs de champs, et points legaux retires (champ_id "point.<id>" = "retire").

export interface EtatChampOdj {
  champId: string;
  valeur: string | null;
}

export interface OdjRepository {
  /** Etat saisi pour une copro + date d'AG (sentinelle 0001-01-01 si sans date). */
  getEtat(coproCode: string, agDateISO: string): Promise<EtatChampOdj[]>;
  /** Enregistre une saisie (valeur vide = efface la saisie, retour a l'auto). */
  setChamp(
    coproCode: string,
    agDateISO: string,
    champId: string,
    valeur: string | null,
    par: string,
  ): Promise<void>;
  /** Reporte l'etat "sans date" sur la date d'AG quand elle est fixee. */
  reporterSansDate(coproCode: string, nouvelleDateISO: string): Promise<void>;
}

/** Date sentinelle des ODJ sans AG planifiee (meme convention que la supervision). */
export const ODJ_SANS_DATE = "0001-01-01";

/** Prefixe des cles de points legaux retires. */
export const PREFIXE_POINT = "point.";

/** Cle RESERVEE portant la cloture de l'ODJ ("reunion terminee", demande Sekou 2026-07-28).
 *  Le double underscore la sort de l'espace des ids de champs (tous en kebab/point : "lieu",
 *  "comptes.budget") : aucune collision possible avec une saisie. On reutilise la table
 *  d'etat existante plutot que d'ajouter une table -- meme parti que PREFIXE_POINT, et
 *  surtout : zero SQL a passer a la main (le SQL non execute nous a deja coute assez cher
 *  cette semaine). */
export const CLE_CLOTURE_ODJ = "__cloture";
