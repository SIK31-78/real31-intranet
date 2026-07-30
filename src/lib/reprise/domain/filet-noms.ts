// Domaine PUR du FILET SUR LES NOMS (aucune I/O). Étape 7 du chantier extraction.
//
// LE TROU QUE RIEN D'AUTRE NE COUVRE. Les six étapes précédentes prouvent les NOMBRES :
// les clés bouclent, les totaux par owner concordent, les lots existent. Aucune ne détecte
// `VENDRAMBILI` pour VENDRAMELLI ni `BOUTON Olivier` pour BOUTON Olivia — une coquille de
// transcription passe TOUS les contrôles arithmétiques, parce qu'elle ne change aucun
// chiffre. C'est le risque résiduel que l'étude assume noir sur blanc.
//
// LA SEULE DÉFENSE SANS MEILLEUR OCR : une DEUXIÈME SOURCE. Le PV d'AG liste les votants
// avec leurs voix (« REDISSI Jeannette (1998), REDISSI Jeannette (2459) »), la FDP imprime
// les totaux de tantièmes. Quand un total concorde AU TANTIÈME PRÈS mais que le patronyme
// diffère d'une ou deux lettres, la coquille est démontrée : deux sources indépendantes
// désignent la même personne avec deux orthographes.
//
// C'est le même raisonnement que `liaison-comptes` (le total de tantièmes départage les
// homonymes) et il réutilise le même vocabulaire de scoring. Coût annoncé dans l'étude :
// 2-3 jours en recyclant l'existant — c'est ce module plus l'apport `votants_avec_tantiemes`
// de l'indexeur, déjà posé à l'étape 2.
//
// CE QU'IL NE FAIT PAS : il ne corrige rien tout seul. Un nom est une donnée d'identité ;
// la correction est un geste humain. Il SIGNALE, avec les deux orthographes et la preuve
// (le total commun).

/** Une personne vue par une source, avec son total de tantièmes. */
export interface NomSource {
  /** Patronyme tel que lu par cette source. */
  nom: string;
  /** Prénom tel que lu, si présent. */
  prenom?: string;
  /** Total de tantièmes attaché à cette personne par cette source. */
  tantiemes: number;
  /**
   * Lots détenus, si connus. DEUXIÈME clé d'appariement (revue 30/07) : quand plusieurs
   * personnes partagent le même total — 6 owners à 153 tantièmes sur S0306, un parking
   * standard chacun — le total ne départage plus rien, mais les NUMÉROS DE LOTS, si. Même
   * geste que la liaison 450, et la donnée est déjà là.
   */
  lots?: readonly number[];
}

/** Coquille démontrée par deux sources qui concordent sur les tantièmes. */
export interface CoquilleDetectee {
  /** Orthographe de la source de référence (celle qu'on croit juste : la FDP). */
  nomReference: string;
  /** Orthographe divergente (celle de l'autre source). */
  nomDivergent: string;
  prenomReference?: string;
  prenomDivergent?: string;
  /** Le total commun : c'est LUI qui prouve qu'il s'agit de la même personne. */
  tantiemes: number;
  /** Distance d'édition entre les deux orthographes. */
  distance: number;
  message: string;
}

/** Normalise pour comparer : majuscules, sans accents, sans ponctuation ni espaces multiples. */
function plier(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Distance maximale ÉCHELONNÉE SUR LA LONGUEUR (revue 30/07). Sur un patronyme court, un
 * seuil de 2 est presque un joker : IZARD est à distance 1 de IZARI, mais AUSSI de IZART,
 * ISARD et AZARD — qui peuvent être trois personnes réelles. On resserre donc en dessous de
 * 6 caractères. Usage courant, et ça ne coûte rien.
 */
export function distanceMaxPour(nom: string): number {
  return plier(nom).length < 6 ? 1 : 2;
}

/** Seuil historique, conservé comme plafond absolu. */
export const DISTANCE_MAX_COQUILLE = 2;

/**
 * Distance de Damerau-Levenshtein : les TRANSPOSITIONS coûtent 1, pas 2.
 *
 * Ce choix n'est pas cosmétique : les coquilles réelles sont très souvent des inversions de
 * lettres adjacentes (`LACSOTI` pour LACOSTE, `TOUNRIEI` pour TOURNIER). Avec une
 * Levenshtein simple, une transposition compte double et sort du seuil — le filet laisserait
 * passer précisément le type d'erreur qu'il est censé attraper.
 */
export function distanceDamerau(a: string, b: string): number {
  const s = plier(a);
  const t = plier(b);
  const d: number[][] = Array.from({ length: s.length + 1 }, (_, i) =>
    Array.from({ length: t.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      const cout = s[i - 1] === t[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cout);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return d[s.length]![t.length]!;
}

/**
 * Couverture du filet : combien d'owners sont ATTEIGNABLES par cette route.
 *
 * Remplace la formule vague « les noms ne sont pas prouvés » par un TAUX (revue 30/07). Sur
 * le lot de référence S0306 : 31 owners sur 44 (70 %) ont un total unique et sont donc
 * couverts ; les 13 autres partagent leur total (153 x6 — un parking standard, 1503 x3,
 * 1404 x2, 2532 x2) et sont structurellement hors de portée du seul critère « tantièmes ».
 * À recalculer par copro et à AFFICHER dans le récap : c'est deux lignes de code et ça dit
 * honnêtement jusqu'où va la garantie.
 */
export interface CouvertureFilet {
  /** Owners à total unique : le filet peut les contrôler. */
  couverts: number;
  /** Owners à total partagé : hors de portée du critère « tantièmes » seul. */
  horsFilet: number;
  /** Part des owners couverts, en pourcentage entier. */
  tauxPourcent: number;
  /** Totaux partagés et leur multiplicité, du plus partagé au moins. */
  totauxPartages: { tantiemes: number; nbOwners: number }[];
  /** Owners hors filet que les LOTS permettent malgré tout de départager. */
  rattrapablesParLots: number;
}

function grouperParTotal(liste: readonly NomSource[]): Map<number, NomSource[]> {
  const m = new Map<number, NomSource[]>();
  for (const n of liste) m.set(n.tantiemes, [...(m.get(n.tantiemes) ?? []), n]);
  return m;
}

/** Deux personnes partagent-elles au moins un lot ? (undefined d'un côté = indécidable) */
function memeLot(a: NomSource, b: NomSource): boolean | undefined {
  if (!a.lots || !b.lots || a.lots.length === 0 || b.lots.length === 0) return undefined;
  return a.lots.some((l) => b.lots!.includes(l));
}

export function couvertureFilet(owners: readonly NomSource[]): CouvertureFilet {
  const groupes = grouperParTotal(owners);
  let couverts = 0;
  let horsFilet = 0;
  let rattrapablesParLots = 0;
  const totauxPartages: { tantiemes: number; nbOwners: number }[] = [];

  for (const [tantiemes, groupe] of groupes) {
    if (groupe.length === 1) {
      couverts += 1;
      continue;
    }
    horsFilet += groupe.length;
    totauxPartages.push({ tantiemes, nbOwners: groupe.length });
    // Rattrapage par les LOTS : si chaque membre du groupe a des lots et qu'ils sont tous
    // disjoints deux a deux, le numero de lot suffit a departager la ou le total echoue.
    const tousDisjoints = groupe.every((a, i) =>
      groupe.slice(i + 1).every((b) => memeLot(a, b) === false),
    );
    if (tousDisjoints) rattrapablesParLots += groupe.length;
  }

  const total = owners.length;
  return {
    couverts,
    horsFilet,
    tauxPourcent: total === 0 ? 0 : Math.round((couverts / total) * 100),
    totauxPartages: totauxPartages.sort((a, b) => b.nbOwners - a.nbOwners),
    rattrapablesParLots,
  };
}

/**
 * Confronte deux sources de noms. DEUX clés d'appariement, dans cet ordre :
 *
 *   1. le TOTAL DE TANTIÈMES, quand il est unique des deux côtés (le cas nominal) ;
 *   2. à défaut, les LOTS DÉTENUS — indispensable pour les 13 owners de S0306 qui partagent
 *      leur total (6 owners à 153 tantièmes détiennent chacun UN parking différent : le
 *      numéro de lot les départage là où le total échoue). Revue du 30/07.
 *
 * Sans aucune des deux clés, on n'apparie PAS : on ne devine pas sur un total ambigu.
 * Le seuil de distance est ÉCHELONNÉ sur la longueur du patronyme (`distanceMaxPour`) :
 * ≤1 sous 6 caractères, ≤2 au-delà — sur un nom court, 2 serait un joker.
 */
export function detecterCoquilles(params: {
  reference: readonly NomSource[];
  confrontee: readonly NomSource[];
  /** Plafond explicite ; par défaut le seuil échelonné sur la longueur. */
  distanceMax?: number;
}): CoquilleDetectee[] {
  const { reference, confrontee, distanceMax } = params;
  const parTotalRef = grouperParTotal(reference);
  const parTotalConf = grouperParTotal(confrontee);
  const coquilles: CoquilleDetectee[] = [];

  const retenir = (r: NomSource, c: NomSource, total: number, cle: "tantiemes" | "lots"): void => {
    const distance = distanceDamerau(r.nom, c.nom);
    const seuil = distanceMax ?? Math.min(distanceMaxPour(r.nom), distanceMaxPour(c.nom));
    if (distance === 0 || distance > seuil) return;
    const preuve =
      cle === "tantiemes"
        ? `${total} tantièmes dans les deux sources`
        : `mêmes lots détenus (${(r.lots ?? []).join(", ")})`;
    coquilles.push({
      nomReference: r.nom,
      nomDivergent: c.nom,
      ...(r.prenom ? { prenomReference: r.prenom } : {}),
      ...(c.prenom ? { prenomDivergent: c.prenom } : {}),
      tantiemes: total,
      distance,
      message:
        `Deux orthographes pour la même personne (${preuve}) : « ${r.nom} » et « ${c.nom} ». ` +
        `L'appariement est certain, donc c'est une coquille de transcription et non deux ` +
        `copropriétaires. Vérifier l'orthographe sur la feuille de présence et le ` +
        `procès-verbal avant d'injecter.`,
    });
  };

  for (const [total, refs] of parTotalRef) {
    const confs = parTotalConf.get(total);
    if (!confs) continue;
    if (refs.length === 1 && confs.length === 1) {
      retenir(refs[0]!, confs[0]!, total, "tantiemes");
      continue;
    }
    // Total AMBIGU : on retombe sur les lots. Un appariement n'est retenu que s'il est
    // UNIQUE -- une seule personne de l'autre source partage ces lots.
    for (const r of refs) {
      const candidats = confs.filter((c) => memeLot(r, c) === true);
      if (candidats.length === 1) retenir(r, candidats[0]!, total, "lots");
    }
  }
  return coquilles.sort((a, b) => a.nomReference.localeCompare(b.nomReference));
}
