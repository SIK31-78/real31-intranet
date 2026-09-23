// Proposition de renouvellement du contrat de syndic, presentee au CS puis votee en AG.
//
// Demande Sekou 2026-09-23 : le CS decouvrait une ligne vide ("Proposition de nouveau
// contrat : ") que le gestionnaire remplissait de tete. Or le cabinet connait deja sa
// hausse : le bareme de l'annee suivante est ouvert dans /admin/tarifs, et TOUTES ses
// lignes bougent du meme taux (mesure 2027 vs 2026 : +2 % exactement sur les 32 lignes).
// On propose donc le contrat en cours revalorise de ce taux, et on rappelle l'option des
// frais postaux au reel quand la copro est encore au forfait.
//
// Domaine PUR : aucune I/O, le bareme et le contrat sont fournis par le service.

/** Taux de revalorisation entre deux barèmes, ex 0.02 pour +2 %. */
export type TauxBareme = number;

/**
 * Le taux d'augmentation entre le bareme de l'annee en cours et celui de l'annee suivante.
 *
 * On ne se fie pas a UNE ligne (une prestation peut etre corrigee isolement) : on prend le
 * ratio MEDIAN des prestations presentes dans les deux baremes, ce qui resiste aux lignes
 * ajoutees, retirees ou retouchees a la main. `null` si l'un des baremes manque ou si
 * aucune prestation n'est commune : on ne propose alors rien plutot que d'inventer.
 */
export function tauxRevalorisation(
  anneeEnCours: readonly { identifiantPrestation: string; montantTtc: number }[],
  anneeSuivante: readonly { identifiantPrestation: string; montantTtc: number }[],
): TauxBareme | null {
  const suivante = new Map(anneeSuivante.map((l) => [l.identifiantPrestation, l.montantTtc]));
  const ratios: number[] = [];
  for (const ligne of anneeEnCours) {
    const apres = suivante.get(ligne.identifiantPrestation);
    if (apres === undefined || ligne.montantTtc <= 0) continue;
    ratios.push(apres / ligne.montantTtc);
  }
  if (ratios.length === 0) return null;
  ratios.sort((a, b) => a - b);
  const milieu = Math.floor(ratios.length / 2);
  const median =
    ratios.length % 2 === 1 ? ratios[milieu]! : (ratios[milieu - 1]! + ratios[milieu]!) / 2;
  // Arrondi au centieme de pourcent : 1.0199999 -> 0.02.
  return Math.round((median - 1) * 10_000) / 10_000;
}

export interface PropositionContratSyndic {
  /** Honoraires proposes, TTC, arrondis au centime. */
  montantTtc: number;
  /** Le taux applique, ex 0.02. */
  taux: TauxBareme;
  /** Taux affichable, ex "2 %". */
  tauxLibelle: string;
}

/**
 * Le contrat en cours revalorise du taux du bareme. `null` si l'un des deux manque, ou si
 * le taux est nul (rien a proposer : le contrat est reconduit tel quel).
 */
export function proposerContratSyndic(
  honorairesActuelsTtc: number | undefined,
  taux: TauxBareme | null,
): PropositionContratSyndic | null {
  if (honorairesActuelsTtc === undefined || honorairesActuelsTtc <= 0) return null;
  if (taux === null || taux === 0) return null;
  const montantTtc = Math.round(honorairesActuelsTtc * (1 + taux) * 100) / 100;
  return { montantTtc, taux, tauxLibelle: formatTaux(taux) };
}

/** 0.02 -> "2 %" ; 0.025 -> "2,5 %". */
export function formatTaux(taux: TauxBareme): string {
  const pct = taux * 100;
  const arrondi = Math.round(pct * 100) / 100;
  return `${arrondi.toLocaleString("fr-FR")} %`;
}

/**
 * Le rappel a faire au CS sur les frais postaux. Le cabinet propose de passer AU REEL
 * quand la copro est encore au forfait (demande Sekou) ; deja au reel, il n'y a rien a
 * proposer et la ligne reste vide.
 */
export function propositionFraisPostaux(fraisPostauxReels: boolean | undefined): string {
  if (fraisPostauxReels === true) return "";
  return "Il est proposé de passer les frais postaux au réel.";
}
