// Administrer le bareme annuel (intranet_tarifs) : le ranger par famille, ouvrir une
// annee en copiant la precedente, mesurer les ecarts. Fonctions pures.
//
// Les tarifs FIGES au contrat (intranet_suivi_contrats.tarifs) ne bougent jamais d'ici :
// changer la grille 2027 ne touche aucun contrat signe (Sekou, 15/09/2026).

import { PRESTATIONS_CONTRAT as PRESTATIONS_DU_CONTRAT_IMPRIME } from "@/lib/domain/contrat/champs-contrat";
import { PRESTATIONS_CONTRAT as PRESTATIONS_FACTURABLES } from "./prestations-contrat";
import { LIGNES_FORFAIT } from "@/lib/domain/proposition/forfait";

/** Une ligne du bareme (meme forme que `LigneBareme` du port, sans en dependre : le domaine ne lit pas les ports). */
export interface LigneBareme {
  identifiantPrestation: string;
  libelle: string;
  montantTtc: number;
}

export type FamilleBareme = "forfait" | "contrat" | "prestations" | "autres";

export const LIBELLE_FAMILLE: Record<FamilleBareme, string> = {
  forfait: "Le forfait de gestion courante (proposition de contrat)",
  contrat: "Les prestations tarifées au contrat (imprimées)",
  prestations: "Les prestations facturables hors contrat imprimé",
  autres: "Autres lignes",
};

const ORDRE_FAMILLES: FamilleBareme[] = ["forfait", "contrat", "prestations", "autres"];

/** La famille d'un identifiant, et son rang dans la famille (l'ordre du document). */
export function familleDe(identifiant: string): { famille: FamilleBareme; rang: number } {
  const forfait = Object.values(LIGNES_FORFAIT) as string[];
  let i = forfait.indexOf(identifiant);
  if (i >= 0) return { famille: "forfait", rang: i };
  i = (PRESTATIONS_DU_CONTRAT_IMPRIME as readonly string[]).indexOf(identifiant);
  if (i >= 0) return { famille: "contrat", rang: i };
  i = PRESTATIONS_FACTURABLES.findIndex((p) => p.identifiantPrestation === identifiant);
  if (i >= 0) return { famille: "prestations", rang: i };
  return { famille: "autres", rang: 0 };
}

export interface LigneBaremeRangee extends LigneBareme {
  famille: FamilleBareme;
}

/** Le bareme range par famille puis dans l'ordre du document ; les inconnus a la fin, par identifiant. */
export function rangerBareme(lignes: LigneBareme[]): LigneBaremeRangee[] {
  return [...lignes]
    .map((l) => ({ ...l, ...familleDe(l.identifiantPrestation) }))
    .sort((a, b) => {
      const f = ORDRE_FAMILLES.indexOf(a.famille) - ORDRE_FAMILLES.indexOf(b.famille);
      if (f !== 0) return f;
      if (a.rang !== b.rang) return a.rang - b.rang;
      return a.identifiantPrestation.localeCompare(b.identifiantPrestation);
    })
    .map((l) => ({ identifiantPrestation: l.identifiantPrestation, libelle: l.libelle, montantTtc: l.montantTtc, famille: l.famille }));
}

/** Les identifiants que l'application attend et qui manquent a une annee. */
export function identifiantsManquants(lignes: LigneBareme[]): string[] {
  const presents = new Set(lignes.map((l) => l.identifiantPrestation));
  const attendus = [
    ...(Object.values(LIGNES_FORFAIT) as string[]),
    ...(PRESTATIONS_DU_CONTRAT_IMPRIME as readonly string[]),
    ...PRESTATIONS_FACTURABLES.map((p) => p.identifiantPrestation),
  ];
  return [...new Set(attendus)].filter((id) => !presents.has(id));
}

/**
 * Ouvrir une annee : les lignes de la source, au meme montant (ou majorees d'un
 * pourcentage, arrondi au centime), pour l'annee cible. Les lignes deja presentes dans la
 * cible sont conservees telles quelles.
 */
export function dupliquerBareme(source: LigneBareme[], dejaDansCible: LigneBareme[], majorationPourcent = 0): LigneBareme[] {
  const deja = new Set(dejaDansCible.map((l) => l.identifiantPrestation));
  const coef = 1 + majorationPourcent / 100;
  return source
    .filter((l) => !deja.has(l.identifiantPrestation))
    .map((l) => ({ ...l, montantTtc: Math.round(l.montantTtc * coef * 100) / 100 }));
}

/** L'ecart en % d'une ligne par rapport a l'annee precedente, null si elle n'existait pas. */
export function ecartAvecPrecedent(ligne: LigneBareme, precedent: LigneBareme[]): number | null {
  const p = precedent.find((x) => x.identifiantPrestation === ligne.identifiantPrestation);
  if (!p || p.montantTtc === 0) return null;
  return Math.round(((ligne.montantTtc - p.montantTtc) / p.montantTtc) * 1000) / 10;
}

/** Un montant saisi est-il acceptable ? */
export function motifRefusMontant(montant: number): string | null {
  if (!Number.isFinite(montant)) return "montant illisible";
  if (montant < 0) return "un tarif ne peut pas être négatif";
  if (montant > 100000) return "montant trop grand";
  return null;
}
