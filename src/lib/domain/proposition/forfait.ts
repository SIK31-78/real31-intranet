// Le prix d'une proposition de contrat de syndic, depuis la grille du cabinet
// (« TARIFS tous services 2026 », onglet syndic, relue le 15/09/2026) :
//   forfait = base + tarif par lot x lots + supplements (chauffage collectif, gardien,
//             ascenseurs, portes de garage)
//   timbres = tarif par coproprietaire x coproprietaires
// puis l'ECART libre du gestionnaire (remise ou majoration), que le client ne voit
// jamais : le contrat porte le montant retenu, la grille reste une trace interne.
// Fonctions pures.

import { htDepuisTtc } from "../facturation/commun";

/** Identifiants des lignes de grille dans `intranet_tarifs` (montants TTC annuels). */
export const LIGNES_FORFAIT = {
  base: "ForfaitBase",
  parLot: "ForfaitParLot",
  chauffageCollectif: "SupChauffageCollectif",
  gardien: "SupGardien",
  parAscenseur: "SupAscenseur",
  parPorteGarage: "SupPorteGarage",
  timbresParCoproprietaire: "TimbresParCoproprietaire",
} as const;
export type LigneForfait = keyof typeof LIGNES_FORFAIT;

/** Ce que la fiche de visite mesure et qui fait le prix. */
export interface CaracteristiquesImmeuble {
  lotsPrincipaux: number;
  /** Pour les timbres. Absent = lots principaux. */
  coproprietaires?: number;
  chauffageCollectif?: boolean;
  gardien?: boolean;
  ascenseurs?: number;
  portesGarage?: number;
}

/** La grille : montant TTC par ligne. Une ligne absente vaut 0 (et se voit dans le detail). */
export type GrilleForfait = Partial<Record<LigneForfait, number>>;

export interface DetailForfait {
  ligne: LigneForfait;
  libelle: string;
  quantite: number;
  unitaireTtc: number;
  montantTtc: number;
}

export interface Forfait {
  details: DetailForfait[];
  /** Honoraires de gestion courante annuels, grille pure. */
  grilleTtc: number;
  grilleHt: number;
  /** Forfait timbres annuel, grille pure. */
  timbresTtc: number;
}

const LIBELLES: Record<LigneForfait, string> = {
  base: "Prise en charge annuelle de la copropriété",
  parLot: "Tarif par lot principal",
  chauffageCollectif: "Supplément immeuble à chauffage collectif",
  gardien: "Supplément immeuble avec gardien",
  parAscenseur: "Supplément par ascenseur",
  parPorteGarage: "Supplément par porte de garage",
  timbresParCoproprietaire: "Forfait frais postaux par copropriétaire",
};

function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculerForfait(c: CaracteristiquesImmeuble, grille: GrilleForfait): Forfait {
  const quantites: Record<LigneForfait, number> = {
    base: 1,
    parLot: Math.max(0, c.lotsPrincipaux),
    chauffageCollectif: c.chauffageCollectif ? 1 : 0,
    gardien: c.gardien ? 1 : 0,
    parAscenseur: Math.max(0, c.ascenseurs ?? 0),
    parPorteGarage: Math.max(0, c.portesGarage ?? 0),
    timbresParCoproprietaire: Math.max(0, c.coproprietaires ?? c.lotsPrincipaux),
  };
  const details: DetailForfait[] = (Object.keys(LIBELLES) as LigneForfait[])
    .map((ligne) => {
      const unitaireTtc = grille[ligne] ?? 0;
      const quantite = quantites[ligne];
      return { ligne, libelle: LIBELLES[ligne], quantite, unitaireTtc, montantTtc: arrondi(unitaireTtc * quantite) };
    })
    .filter((d) => d.quantite > 0);
  const grilleTtc = arrondi(details.filter((d) => d.ligne !== "timbresParCoproprietaire").reduce((s, d) => s + d.montantTtc, 0));
  const timbresTtc = arrondi(details.find((d) => d.ligne === "timbresParCoproprietaire")?.montantTtc ?? 0);
  return { details, grilleTtc, grilleHt: arrondi(htDepuisTtc(grilleTtc)), timbresTtc };
}

/** Ce que le gestionnaire retient, apres ecart. */
export interface PrixRetenu {
  honorairesTtc: number;
  timbresTtc: number;
}

/** Ecart entre le retenu et la grille, en %. null si la grille est nulle. */
export function ecartGrille(retenuTtc: number, grilleTtc: number): number | null {
  if (grilleTtc <= 0) return null;
  return arrondi(((retenuTtc - grilleTtc) / grilleTtc) * 100);
}
