// Domaine PUR de la CONTRE-PREUVE par copropriétaire (aucune I/O).
// Étape 4 du chantier extraction (bug report S0306, cause 4).
//
// LE PROBLÈME. S0306 a produit 5 lots orphelins (29, 38, 106, 116, 204) ALORS QU'IL Y AVAIT
// 118 attributions au total : des lots avaient donc reçu DEUX propriétaires pendant que
// d'autres n'en avaient aucun. Le lot « 204 » n'était même pas un orphelin plausible — la
// FDP le porte chez un copropriétaire : c'était un numéro voisin mal transcrit.
//
// LE FILET. La feuille de présence imprime, pour chaque copropriétaire, son TOTAL DE
// TANTIÈMES (« Nombre de tantièmes : 2 459 »). On confronte donc, pour chaque owner, la
// somme des tantièmes de la clé générale sur SES lots au total imprimé. C'est exactement le
// geste qui a sauvé la compta (`verifierTotauxParCompte` : report + écritures == total
// imprimé) : il LOCALISE l'erreur par personne au lieu de constater des orphelins en fin de
// course, quand on ne sait plus lequel des 118 liens est faux.
//
// Un owner SANS total imprimé n'est pas une erreur : il est NON CONTRÔLÉ. On ne signale que
// les écarts réels — même règle que le contrôle par compte de la compta.

import type { Attribution, Owner, Tantieme } from "@/lib/reprise/domain/patrimoine";

/** Total de tantièmes imprimé par la source (FDP) pour un copropriétaire. */
export interface TotalImprimeOwner {
  /** Id interne de l'owner (jamais un nom : ce module ne manipule pas de PII). */
  ownerId: string;
  /** Total tel qu'imprimé sur la feuille de présence. */
  total: number;
}

export interface EcartOwner {
  ownerId: string;
  /** Somme des tantièmes de la clé générale sur les lots attribués à cet owner. */
  calcule: number;
  /** Total imprimé par la source. */
  imprime: number;
  /** calcule - imprime (signé : positif = on lui a attribué trop). */
  ecart: number;
  /** Lots attribués à cet owner, pour orienter la recherche. */
  lots: number[];
}

export interface ResultatContrePreuve {
  /** Owners dont la somme ne tombe pas sur le total imprimé. */
  ecarts: EcartOwner[];
  /** Owners contrôlés (un total imprimé était disponible). */
  nbControles: number;
  /** Owners sans total imprimé : NON contrôlés, ce n'est pas une erreur. */
  nbNonControles: number;
  /** Aucun écart parmi les owners contrôlés. */
  ok: boolean;
}

/**
 * Confronte, owner par owner, la somme des tantièmes de la clé générale à son total imprimé.
 *
 * `cleGeneraleCode` est la clé des charges communes générales (celle marquée `defaut`) :
 * c'est la seule qui concerne TOUS les lots, donc la seule dont le total par owner est
 * comparable à celui imprimé sur la FDP.
 */
export function verifierTotauxParOwner(params: {
  owners: readonly Owner[];
  attributions: readonly Attribution[];
  tantiemes: readonly Tantieme[];
  cleGeneraleCode: string;
  totauxImprimes: readonly TotalImprimeOwner[];
}): ResultatContrePreuve {
  const { owners, attributions, tantiemes, cleGeneraleCode, totauxImprimes } = params;
  const parLot = new Map(
    tantiemes.filter((t) => t.cleCode === cleGeneraleCode).map((t) => [t.lot, t.valeur]),
  );
  const imprimeParOwner = new Map(totauxImprimes.map((t) => [t.ownerId, t.total]));

  const lotsParOwner = new Map<string, number[]>();
  for (const a of attributions) {
    lotsParOwner.set(a.ownerId, [...(lotsParOwner.get(a.ownerId) ?? []), a.lot]);
  }

  const ecarts: EcartOwner[] = [];
  let nbControles = 0;
  let nbNonControles = 0;

  for (const o of owners) {
    const imprime = imprimeParOwner.get(o.id);
    if (imprime === undefined) {
      nbNonControles += 1;
      continue; // non controle : aucune reference, ce n'est pas une erreur
    }
    nbControles += 1;
    const lots = (lotsParOwner.get(o.id) ?? []).slice().sort((a, b) => a - b);
    const calcule = lots.reduce((s, l) => s + (parLot.get(l) ?? 0), 0);
    if (calcule !== imprime) ecarts.push({ ownerId: o.id, calcule, imprime, ecart: calcule - imprime, lots });
  }

  return { ecarts, nbControles, nbNonControles, ok: ecarts.length === 0 };
}

/**
 * Lots attribués PLUSIEURS fois et lots attribués à PERSONNE. Le cas S0306 : 118
 * attributions pour 118 lots, mais 5 orphelins — donc 5 doublons ailleurs. Les deux se
 * lisent ensemble, sinon le total qui « tombe juste » masque la double erreur.
 */
export function anomaliesAttributions(params: {
  lots: readonly { numero: number }[];
  attributions: readonly Attribution[];
}): { orphelins: number[]; multiAttribues: { lot: number; nb: number }[]; inconnus: number[] } {
  const { lots, attributions } = params;
  const connus = new Set(lots.map((l) => l.numero));
  const compte = new Map<number, number>();
  for (const a of attributions) compte.set(a.lot, (compte.get(a.lot) ?? 0) + 1);

  return {
    orphelins: [...connus].filter((n) => !compte.has(n)).sort((a, b) => a - b),
    multiAttribues: [...compte.entries()]
      .filter(([, nb]) => nb > 1)
      .map(([lot, nb]) => ({ lot, nb }))
      .sort((a, b) => a.lot - b.lot),
    inconnus: [...compte.keys()].filter((n) => !connus.has(n)).sort((a, b) => a - b),
  };
}

/** Message d'écart, SANS PII : ids internes, numéros de lots et nombres seulement. */
export function messageEcartOwner(e: EcartOwner): string {
  const sens = e.ecart > 0 ? "de trop" : "de moins";
  return (
    `Copropriétaire ${e.ownerId} : la somme des tantièmes de ses lots (${e.lots.join(", ")}) ` +
    `vaut ${e.calcule} au lieu des ${e.imprime} imprimés — ${Math.abs(e.ecart)} ${sens}. ` +
    `Vérifier ses numéros de lots sur la feuille de présence.`
  );
}
