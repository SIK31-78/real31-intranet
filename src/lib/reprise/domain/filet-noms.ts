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

/** Distance maximale au-delà de laquelle on ne parle plus de coquille mais de deux personnes. */
export const DISTANCE_MAX_COQUILLE = 2;

/** Normalise pour comparer : majuscules, sans accents, sans ponctuation ni espaces multiples. */
function plier(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

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
 * Confronte deux sources de noms sur la base de leurs TANTIÈMES.
 *
 * `reference` = la source qu'on retient (typiquement la FDP, qui porte les adresses et les
 * totaux imprimés) ; `confrontee` = l'autre (typiquement les votants du PV).
 *
 * Une coquille est retenue quand un total de tantièmes est porté par UNE SEULE personne dans
 * CHAQUE source (sinon l'appariement serait ambigu) et que les orthographes diffèrent d'au
 * plus `DISTANCE_MAX_COQUILLE`. Un total partagé par deux personnes (les deux REDISSI ont
 * 1 998 et 2 459, distincts — mais deux lots à 153 sont légion) est ÉCARTÉ : on ne devine
 * pas sur un total ambigu.
 */
export function detecterCoquilles(params: {
  reference: readonly NomSource[];
  confrontee: readonly NomSource[];
  distanceMax?: number;
}): CoquilleDetectee[] {
  const { reference, confrontee, distanceMax = DISTANCE_MAX_COQUILLE } = params;

  const indexer = (liste: readonly NomSource[]): Map<number, NomSource[]> => {
    const m = new Map<number, NomSource[]>();
    for (const n of liste) m.set(n.tantiemes, [...(m.get(n.tantiemes) ?? []), n]);
    return m;
  };
  const parTotalRef = indexer(reference);
  const parTotalConf = indexer(confrontee);

  const coquilles: CoquilleDetectee[] = [];
  for (const [total, refs] of parTotalRef) {
    const confs = parTotalConf.get(total);
    // Appariement NON AMBIGU exigé des DEUX côtés : une seule personne pour ce total.
    if (!confs || refs.length !== 1 || confs.length !== 1) continue;
    const r = refs[0]!;
    const c = confs[0]!;
    const distance = distanceDamerau(r.nom, c.nom);
    if (distance === 0 || distance > distanceMax) continue;
    coquilles.push({
      nomReference: r.nom,
      nomDivergent: c.nom,
      ...(r.prenom ? { prenomReference: r.prenom } : {}),
      ...(c.prenom ? { prenomDivergent: c.prenom } : {}),
      tantiemes: total,
      distance,
      message:
        `Deux orthographes pour la même personne (${total} tantièmes dans les deux sources) : ` +
        `« ${r.nom} » et « ${c.nom} ». Les tantièmes concordent exactement, donc c'est une ` +
        `coquille de transcription et non deux copropriétaires. Vérifier l'orthographe sur la ` +
        `feuille de présence et le procès-verbal avant d'injecter.`,
    });
  }
  return coquilles.sort((a, b) => a.nomReference.localeCompare(b.nomReference));
}
