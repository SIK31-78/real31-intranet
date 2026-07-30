// Domaine PUR du GARDE-FOU D'EXTRACTION (aucune I/O, aucun import technique).
// Étape 1 du chantier extraction (docs/etude-indexation-extraction-patrimoine.md §3bis).
//
// POURQUOI. Sur S0306, l'extraction a EMIS une clé 300 « ascenseur » de 38 lots sommant
// 38 000 pour un total annoncé de 10 000 : le tableau source était un scan illisible, le
// modèle a fabriqué ~1 000 × 38 lots. Les auto-checks l'ont bien attrapée -- mais EN AVAL,
// après que le faux jeu soit entré dans le pipeline. Le principe posé pour la compta
// (« l'IA ne transcrit jamais ») s'applique ici : mieux vaut REFUSER d'émettre que d'émettre
// un jeu faux qu'un contrôle signalera trop tard.
//
// CE QUE FAIT CE MODULE. Pour chaque clé, la somme des tantièmes doit tomber sur le total
// annoncé. Sinon, les tantièmes de CETTE clé sont RETIRÉS (la clé survit, avec son total)
// et un REFUS ACTIONNABLE est émis. Les autres clés ne sont pas punies : une clé fausse
// n'invalide pas une clé qui boucle.
//
// CE QUE CE MODULE NE FAIT PAS. Il ne devine pas la cause. Un déséquilibre peut venir d'une
// page manquante, d'une valeur mal transcrite ou d'un doublon : le message DÉCRIT ce qui est
// mesuré (couvert / manquant / écart) et demande la pièce, il n'affirme pas de diagnostic.
//
// IL NE REMPLACE PAS LES AUTO-CHECKS : il refuse en amont, auto-checks vérifie en aval.
// Les deux restent.

import type { Cle, Lot, Tantieme } from "@/lib/reprise/domain/patrimoine";

/** Plage de numéros de lots contigus, bornes incluses. */
export interface PlageLots {
  debut: number;
  fin: number;
}

/** Pourquoi une clé a été refusée. Détermine la formulation de la demande. */
export type MotifRefus =
  /** Total annoncé absent ou <= 0 : rien n'est vérifiable, donc rien n'est émis. */
  | "total_invalide"
  /** Aucun tantième extrait (typiquement un tableau scanné illisible). */
  | "aucun_tantieme"
  /** Somme < total ET des lots connus sont absents : tableau vraisemblablement tronqué. */
  | "tableau_incomplet"
  /** Somme < total mais tous les lots sont couverts : une ou des valeurs sont fausses. */
  | "somme_insuffisante"
  /** Somme > total : sur-comptage (valeurs fabriquées, lignes dupliquées). */
  | "somme_excedentaire"
  /**
   * Somme / total tombe sur un FACTEUR D'ÉCHELLE net (x10, x100, ou l'inverse). Ce n'est pas
   * une valeur fausse : c'est la MAUVAISE COLONNE qui a été lue -- typiquement la base des
   * charges générales (100 000) à la place de celle de l'ascenseur (10 000). Le message à
   * l'humain n'est donc pas le même : on ne demande pas une page, on fait revérifier la
   * colonne. (Ajouté le 2026-07-30 en revue : envoyer l'ancien syndic chercher une page qui
   * n'existe pas brûle du crédit auprès de quelqu'un déjà réticent.)
   */
  | "facteur_echelle";

/**
 * Un refus d'émettre, ACTIONNABLE : il porte de quoi rédiger la demande à l'ancien syndic.
 * « Un refus actionnable vaut dix refus vagues » (critère d'acceptation, étude §3bis).
 */
export interface RefusActionnable {
  cleCode: string;
  libelleCle: string;
  motif: MotifRefus;
  /** Total annoncé par la source (0 si absent). */
  totalAttendu: number;
  /** Somme des tantièmes extraits, avant retrait. */
  sommeCouverte: number;
  /** Nombre de tantièmes retirés par ce refus. */
  tantiemesRetires: number;
  /** Lots effectivement couverts par le tableau extrait, compactés. */
  plagesCouvertes: PlageLots[];
  /** Lots connus absents du tableau, compactés. Vide si tout est couvert. */
  plagesManquantes: PlageLots[];
  /** Lots référencés par le tableau mais inconnus de l'EDD (numéros mal transcrits). */
  lotsInconnus: number[];
  /** LE message : constat mesuré + demande précise, copiable dans un mail. */
  message: string;
}

export interface ResultatGarde {
  /** Clés conservées (toutes : une clé refusée garde son total, elle perd ses tantièmes). */
  cles: Cle[];
  /** Tantièmes des seules clés qui bouclent. */
  tantiemes: Tantieme[];
  refus: RefusActionnable[];
  /** Notes à joindre au récap (une par refus, sans PII : codes et nombres seulement). */
  notes: string[];
}

/**
 * "38 000" — groupement par milliers avec un espace ORDINAIRE, formaté à la main.
 *
 * Volontairement PAS `toLocaleString("fr-FR")` : selon la version d'ICU embarquée, il rend
 * un espace fine insécable (U+202F) ou insécable (U+00A0). Or ce nombre part dans un
 * message destiné à un mail et comparé par des tests : un séparateur qui change avec la
 * version de Node ferait échouer les tests sans qu'une ligne de code ait bougé, et
 * casserait les recherches de texte. Déterministe ici, c'est mieux que typographique.
 */
function nombreFr(n: number): string {
  const groupes = Math.trunc(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (n < 0 ? "-" : "") + groupes;
}

/** Facteurs d'échelle reconnus : lire une base 100 000 au lieu de 10 000, etc. */
const FACTEURS_ECHELLE = [10, 100, 1000] as const;

/**
 * Le rapport somme/total tombe-t-il sur un facteur d'échelle net ? Renvoie le facteur signé
 * (10 = on a lu 10 fois trop grand, 0.1 = 10 fois trop petit), sinon null.
 *
 * Tolérance de 0,5 % : un tableau lu à 99 980 pour une base 10 000 reste un facteur 10 mal
 * transcrit, pas un mystère. En dessous, c'est une vraie erreur de valeur.
 */
function facteurEchelle(somme: number, total: number): number | null {
  if (total <= 0 || somme <= 0) return null;
  for (const f of FACTEURS_ECHELLE) {
    if (Math.abs(somme / total - f) / f <= 0.005) return f;
    if (Math.abs(total / somme - f) / f <= 0.005) return 1 / f;
  }
  return null;
}

/** Compacte des numéros en plages contiguës : [1,2,3,7,8] -> [1-3, 7-8]. */
export function compacterPlages(numeros: readonly number[]): PlageLots[] {
  const tries = [...new Set(numeros)].sort((a, b) => a - b);
  const plages: PlageLots[] = [];
  for (const n of tries) {
    const derniere = plages[plages.length - 1];
    if (derniere && n === derniere.fin + 1) derniere.fin = n;
    else plages.push({ debut: n, fin: n });
  }
  return plages;
}

/** "51-66, 201-208 et 501-506" — le « et » final, parce que ça part dans un mail. */
export function formaterPlages(plages: readonly PlageLots[]): string {
  const morceaux = plages.map((p) => (p.debut === p.fin ? `${p.debut}` : `${p.debut}-${p.fin}`));
  if (morceaux.length <= 1) return morceaux[0] ?? "";
  return `${morceaux.slice(0, -1).join(", ")} et ${morceaux[morceaux.length - 1]}`;
}

/** Constat mesuré, sans diagnostic : ce qu'on a, ce qui manque, l'écart. */
function constat(r: Omit<RefusActionnable, "message">): string {
  const tete = `Clé ${r.cleCode} (${r.libelleCle})`;
  switch (r.motif) {
    case "total_invalide":
      return `${tete} : aucun total de tantièmes exploitable n'a été trouvé dans la source — les tantièmes ne peuvent pas être vérifiés, ils n'ont donc pas été retenus.`;
    case "aucun_tantieme":
      return `${tete} : aucun tantième n'a pu être lu (total annoncé ${nombreFr(r.totalAttendu)}).`;
    case "tableau_incomplet":
      return `${tete} : le tableau de répartition ne couvre que les lots ${formaterPlages(r.plagesCouvertes)} (${nombreFr(r.sommeCouverte)} / ${nombreFr(r.totalAttendu)}). Manquent les lots ${formaterPlages(r.plagesManquantes)}.`;
    case "somme_insuffisante":
      return `${tete} : tous les lots sont couverts mais la somme des tantièmes est de ${nombreFr(r.sommeCouverte)} au lieu de ${nombreFr(r.totalAttendu)} — une ou plusieurs valeurs sont donc fausses.`;
    case "somme_excedentaire":
      return `${tete} : la somme des tantièmes lus est de ${nombreFr(r.sommeCouverte)} pour un total annoncé de ${nombreFr(r.totalAttendu)} — les valeurs lues ne sont pas fiables.`;
    case "facteur_echelle": {
      const f = facteurEchelle(r.sommeCouverte, r.totalAttendu);
      const sens = f && f > 1 ? `${f} fois trop grande` : `${f ? Math.round(1 / f) : "?"} fois trop petite`;
      return `${tete} : la somme lue (${nombreFr(r.sommeCouverte)}) est exactement ${sens} par rapport au total annoncé (${nombreFr(r.totalAttendu)}) — ce n'est pas une valeur fausse, c'est vraisemblablement la MAUVAISE COLONNE du tableau qui a été lue (une autre clé a souvent une base différente).`;
    }
  }
}

/** La DEMANDE : ce qu'on veut recevoir pour débloquer. C'est elle qui a fait boucler S0306. */
function demande(r: Omit<RefusActionnable, "message">): string {
  const objet = `des tantièmes par lot de la clé ${r.cleCode}`;
  switch (r.motif) {
    case "total_invalide":
      return `Demander à l'ancien syndic le tableau de répartition ${objet} avec son total, ou un export des tantièmes par lot.`;
    case "aucun_tantieme":
      return `Demander à l'ancien syndic une version lisible du tableau de répartition ${objet} (scan net ou export), le document fourni n'étant pas exploitable.`;
    case "tableau_incomplet":
      return `Demander à l'ancien syndic la page suivante du tableau de répartition ${objet}, ou un export des tantièmes par lot.`;
    case "somme_insuffisante":
    case "somme_excedentaire":
      return `Demander à l'ancien syndic un export ${objet}, la lecture du document fourni n'étant pas fiable.`;
    case "facteur_echelle":
      // On ne demande PAS de page : la pièce est là, c'est la lecture qui a pris la mauvaise
      // colonne. Une demande inutile brûle du crédit auprès de l'ancien syndic.
      return `Vérifier quelle colonne du tableau correspond bien à la clé ${r.cleCode} avant de redemander quoi que ce soit : le document fourni contient probablement la bonne donnée dans une colonne voisine.`;
  }
}

/**
 * Applique le garde-fou à une sortie d'extraction brute.
 *
 * Une clé est CONSERVÉE avec ses tantièmes si et seulement si son total annoncé est
 * exploitable (> 0), qu'aucun tantième ne porte sur un lot inconnu, et que la somme tombe
 * EXACTEMENT sur ce total. Les tantièmes sont des entiers : l'égalité est stricte, pas de
 * tolérance (contrairement à la balance comptable, qui manipule des centimes).
 *
 * Les tantièmes orphelins (clé absente de `cles`) sont retirés sans refus : ce n'est pas
 * une clé refusée, c'est une ligne sans clé — auto-checks le signalera comme tel.
 */
export function appliquerGardeExtraction(params: {
  lots: readonly Lot[];
  cles: readonly Cle[];
  tantiemes: readonly Tantieme[];
}): ResultatGarde {
  const { lots, cles, tantiemes } = params;
  const numerosConnus = new Set(lots.map((l) => l.numero));

  const parCle = new Map<string, Tantieme[]>();
  for (const t of tantiemes) {
    parCle.set(t.cleCode, [...(parCle.get(t.cleCode) ?? []), t]);
  }

  const tantiemesRetenus: Tantieme[] = [];
  const refus: RefusActionnable[] = [];

  for (const cle of cles) {
    const lignes = parCle.get(cle.code) ?? [];
    const somme = lignes.reduce((s, t) => s + t.valeur, 0);
    const lotsInconnus = [...new Set(lignes.map((t) => t.lot).filter((n) => !numerosConnus.has(n)))].sort(
      (a, b) => a - b,
    );
    const couverts = lignes.map((t) => t.lot).filter((n) => numerosConnus.has(n));
    const manquants = [...numerosConnus].filter((n) => !couverts.includes(n));

    const motif = ((): MotifRefus | null => {
      if (!Number.isFinite(cle.totalAttendu) || cle.totalAttendu <= 0) return "total_invalide";
      if (lignes.length === 0) return "aucun_tantieme";
      if (somme === cle.totalAttendu && lotsInconnus.length === 0) return null; // la clé boucle
      // Le facteur d'échelle passe AVANT excédent/insuffisance : c'est un diagnostic plus
      // précis du MEME symptôme, et il change la demande faite à l'humain.
      if (facteurEchelle(somme, cle.totalAttendu) !== null) return "facteur_echelle";
      if (somme > cle.totalAttendu) return "somme_excedentaire";
      if (manquants.length > 0) return "tableau_incomplet";
      return "somme_insuffisante";
    })();

    if (motif === null) {
      tantiemesRetenus.push(...lignes);
      continue;
    }

    const sansMessage: Omit<RefusActionnable, "message"> = {
      cleCode: cle.code,
      libelleCle: cle.libelle,
      motif,
      totalAttendu: Number.isFinite(cle.totalAttendu) ? cle.totalAttendu : 0,
      sommeCouverte: somme,
      tantiemesRetires: lignes.length,
      plagesCouvertes: compacterPlages(couverts),
      plagesManquantes: compacterPlages(manquants),
      lotsInconnus,
    };
    // Les lots inconnus s'ajoutent au constat : un numéro mal transcrit est une piste utile.
    const suffixeInconnus =
      lotsInconnus.length > 0
        ? ` Le tableau référence aussi des lots inexistants dans l'EDD : ${lotsInconnus.join(", ")}.`
        : "";
    refus.push({
      ...sansMessage,
      message: `${constat(sansMessage)}${suffixeInconnus} ${demande(sansMessage)}`,
    });
  }

  return {
    cles: [...cles],
    tantiemes: tantiemesRetenus,
    refus,
    // Note SANS PII : codes de clés et nombres seulement (même règle que mapping-compta).
    notes: refus.map((r) => r.message),
  };
}
