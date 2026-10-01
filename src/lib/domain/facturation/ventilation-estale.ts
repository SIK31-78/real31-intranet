// Ventilation d'une facture REAL31 dans la compta ESTALE de la copropriete (REA-11).
//
// Fonctions pures. Les lignes viennent de l'INTRANET (c'est lui qui sait quelle part
// est de l'honoraire, quelle part du timbre) ; Pennylane ne fournit que le numero, le
// PDF et le total TTC, qui sert de controle : si les deux ne tombent pas d'accord au
// centime, la facture ne part pas.
//
// Perimetre V1 = gestion courante seulement (decision Sekou du 01/10/2026). Les autres
// prestations viendront avec leurs propres comptes (6221, 6222...) ; l'etat date ira
// sur le compte du coproprietaire, pas sur la copro.

import { CATEGORIE_FORFAIT_POSTAUX, CATEGORIE_GESTION_COURANTE } from "./produits";

/** Une ligne de charge de la facture, deja ventilee par compte ESTALE. */
export interface LigneChargeEstale {
  /** Nomenclature du compte de charge ESTALE, ex "6211". */
  compte: string;
  libelle: string;
  /** Montant TTC de la ligne, en euros. */
  montantTtc: number;
  /** Part de TVA comprise dans le TTC, en euros. */
  tva: number;
}

/** Categorie produit intranet -> compte de charge ESTALE (relevé sur les 9 copros le 01/10/2026). */
export const COMPTE_ESTALE_PAR_CATEGORIE: Record<string, { compte: string; libelle: string }> = {
  [CATEGORIE_GESTION_COURANTE]: { compte: "6211", libelle: "Honoraires de gestion courante" },
  [CATEGORIE_FORFAIT_POSTAUX]: { compte: "6213", libelle: "Forfait de frais postaux" },
};

export interface LigneIntranet {
  categorieProduit: string | null;
  quantite: number;
  prixUnitaireHt: number;
  tauxTva: number;
}

const arrondi = (n: number): number => Math.round(n * 100) / 100;

/**
 * Regroupe les lignes de la facture par compte ESTALE, en TTC et TVA.
 * Refuse une ligne dont la categorie n'a pas de compte : mieux vaut ne rien envoyer
 * qu'imputer au hasard.
 */
export function ventilerPourEstale(lignes: LigneIntranet[]): LigneChargeEstale[] {
  const parCompte = new Map<string, LigneChargeEstale>();
  for (const l of lignes) {
    const cible = l.categorieProduit ? COMPTE_ESTALE_PAR_CATEGORIE[l.categorieProduit] : undefined;
    if (!cible) {
      throw new Error(
        `Ligne « ${l.categorieProduit ?? "sans catégorie"} » : aucun compte ESTALE prévu, facture non envoyée.`,
      );
    }
    const ht = arrondi(l.quantite * l.prixUnitaireHt);
    const tva = arrondi(ht * l.tauxTva);
    const existante = parCompte.get(cible.compte);
    if (existante) {
      existante.montantTtc = arrondi(existante.montantTtc + ht + tva);
      existante.tva = arrondi(existante.tva + tva);
    } else {
      parCompte.set(cible.compte, { compte: cible.compte, libelle: cible.libelle, montantTtc: arrondi(ht + tva), tva });
    }
  }
  return [...parCompte.values()].filter((l) => l.montantTtc !== 0);
}

/** Le total TTC ventile tombe-t-il au centime sur celui de la facture Pennylane ? */
export function totalConcorde(lignes: LigneChargeEstale[], ttcFacture: number): boolean {
  const total = arrondi(lignes.reduce((t, l) => t + l.montantTtc, 0));
  return Math.abs(total - arrondi(ttcFacture)) < 0.005;
}

export interface ExerciceEstale {
  /** Daterange ESTALE, ex "2026-07-01,2027-06-30" (ou "[2026-07-01,2027-07-01)"). */
  periode: string;
  verrouille: boolean;
  clos: boolean;
}

/**
 * Peut-on saisir a cette date ? Il faut un exercice qui la contienne, ni clos ni
 * verrouille. Renvoie null si oui, sinon la raison, lisible par la comptable.
 */
export function raisonExerciceFerme(dateIso: string, exercices: ExerciceEstale[]): string | null {
  const contenant = exercices.find((e) => {
    const dates = e.periode.match(/\d{4}-\d{2}-\d{2}/g);
    if (!dates || dates.length < 2) return false;
    const [debut, fin] = dates as [string, string];
    const finExclue = e.periode.trim().endsWith(")");
    return dateIso >= debut && (finExclue ? dateIso < fin : dateIso <= fin);
  });
  if (!contenant) return `Aucun exercice ESTALE ne couvre le ${dateIso}.`;
  if (contenant.clos) return `L'exercice ESTALE qui couvre le ${dateIso} est clos.`;
  if (contenant.verrouille) return `L'exercice ESTALE qui couvre le ${dateIso} est verrouillé.`;
  return null;
}
