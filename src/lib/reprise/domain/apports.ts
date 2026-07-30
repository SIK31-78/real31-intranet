// Domaine PUR des APPORTS d'un document (aucune I/O, aucun import technique).
// Étape 2 du chantier extraction (docs/etude-indexation-extraction-patrimoine.md §1).
//
// LE RENVERSEMENT. La question posée à un document cesse d'être « de quel TYPE es-tu ? »
// pour devenir « qu'APPORTES-tu ? ». Le routage par type ne tient pas, quatre faits de
// S0306 le montrent :
//   1. un document porte plusieurs données (la CONVOCATION de 87 pages porte l'ODJ, le RGD,
//      un devis ET l'état de répartition par compte 450 en pages 75-76) ;
//   2. la donnée n'est pas où le nom la promet (les tantièmes venaient de la FEUILLE DE
//      PRÉSENCE, pas de l'EDD ni du RCP, tous deux scans de 1974) ;
//   3. le même sigle désigne deux choses (« EDD » = état DESCRIPTIF de division côté
//      patrimoine, ou état DÉTAILLÉ des dépenses côté compta) ;
//   4. la redondance existe sous deux formes (rgd.pdf scanné == Releve-general-depenses
//      texte) et doit être exploitée, pas subie.
//
// Un apport peut venir de PLUSIEURS documents : c'est voulu. La redondance est une
// CONTRE-PREUVE (on confronte, un écart devient une note), jamais un choix silencieux.

/**
 * Vocabulaire FERMÉ des apports. Aligné sur data/samples/S0306/indexation-attendue.json,
 * qui est la référence : ce que 14 documents réels apportent réellement.
 */
export const APPORTS = [
  // --- Patrimoine ---
  /** Liste de lots avec descriptif (type, usage, étage, bâtiment). */
  "lots_descriptif",
  /** Tableau de tantièmes par lot pour une clé. */
  "tantiemes_par_lot",
  /** Définition/périmètre des clés (quelles charges, quels lots concernés) — sans tantièmes. */
  "perimetre_cles",
  /** Copropriétaires avec adresses. */
  "owners_adresses",
  /** Liens lot -> copropriétaire. */
  "attributions",
  // --- Contre-preuves ---
  /** « Nombre de tantièmes : X » par copropriétaire (contre-preuve des attributions). */
  "totaux_tantiemes_par_owner",
  /** Votants du PV avec leurs voix (contre-preuve des homonymes ET des patronymes). */
  "votants_avec_tantiemes",
  /** Compteurs de lots / bâtiments — CONTRÔLE seulement, jamais source. */
  "nb_lots_batiments",
  // --- Compta ---
  /** Lignes d'écritures datées débit/crédit (grand livre). */
  "ecritures_comptables",
  /** TVA et part déductible par facture (RGD) — indispensable au bloc B. */
  "tva_deductible_par_facture",
  /** Colonnes de répartition réellement utilisées en compta. */
  "cles_utilisees_en_compta",
  /** État de répartition par compte 450 avec tantièmes (liaison owners <-> 450). */
  "quotes_parts_450",
  /** Appels de fonds par clé (contrôle croisé des clés ; bloc C). */
  "appels_de_fonds_par_cle",
  /** Comptes débiteurs / créditeurs. */
  "debiteurs_crediteurs",
  /** Budgets prévisionnels (annexes comptables). */
  "budgets",
  // --- Divers ---
  /** Date d'effet du contrat de syndic. */
  "date_effet_contrat",
  /** Codes eStale déjà attribués (export d'un outil). */
  "codes_estale",
  /** RIEN d'utile à la reprise -> ne pas analyser (économie directe). */
  "aucun",
] as const;

export type Apport = (typeof APPORTS)[number];

/** Forme matérielle d'un document : elle décide du chemin d'extraction. */
export type FormeDocument = "texte" | "scan";

/** Ce qu'un document apporte, avec la confiance qu'on accorde à cette détection. */
export interface IndexDocument {
  nom: string;
  forme: FormeDocument;
  apports: Apport[];
  /** Nom du document dont celui-ci est un doublon de FORME (même contenu, autre support). */
  doublonDe?: string;
  /** Pourquoi ces apports (trace lisible, sans PII). */
  motif?: string;
}

// --- Couverture des apports requis (§1.5, contrôle miroir) -------------------
//
// Le vocabulaire fermé + le repli "aucun" ont un angle mort : un format de syndic inconnu
// perdrait ses données avec une simple note. Le contrôle porte donc sur la DONNÉE, pas sur
// le document : si aucun document ne fournit `tantiemes_par_lot`, c'est BLOQUANT, quel que
// soit le nombre de documents bien indexés. Différence d'ensembles, zéro token.

export const REQUIS_PATRIMOINE: readonly Apport[] = [
  "lots_descriptif",
  "tantiemes_par_lot",
  "owners_adresses",
  "attributions",
];
export const SOUHAITES_PATRIMOINE: readonly Apport[] = [
  "nb_lots_batiments",
  "totaux_tantiemes_par_owner",
  "votants_avec_tantiemes",
];
export const REQUIS_COMPTA: readonly Apport[] = ["ecritures_comptables"];
export const SOUHAITES_COMPTA: readonly Apport[] = [
  "tva_deductible_par_facture",
  "cles_utilisees_en_compta",
  "quotes_parts_450",
  "appels_de_fonds_par_cle",
];

export interface Couverture {
  /** Apports requis introuvables : BLOQUANT (rien ne peut avancer sans eux). */
  requisManquants: Apport[];
  /** Apports souhaités introuvables : note, pas un blocage. */
  souhaitesManquants: Apport[];
  /** Aucun requis manquant. */
  ok: boolean;
}

/**
 * Couverture des apports par un lot de documents indexés. Les doublons de forme ne
 * comptent qu'une fois (ils n'apportent rien de plus, c'est le principe d'un doublon).
 */
export function verifierCouverture(
  index: readonly IndexDocument[],
  perimetre: "patrimoine" | "compta" | "les_deux" = "les_deux",
): Couverture {
  const fournis = new Set<Apport>();
  for (const d of index) {
    if (d.doublonDe) continue;
    for (const a of d.apports) fournis.add(a);
  }
  const requis = [
    ...(perimetre !== "compta" ? REQUIS_PATRIMOINE : []),
    ...(perimetre !== "patrimoine" ? REQUIS_COMPTA : []),
  ];
  const souhaites = [
    ...(perimetre !== "compta" ? SOUHAITES_PATRIMOINE : []),
    ...(perimetre !== "patrimoine" ? SOUHAITES_COMPTA : []),
  ];
  const requisManquants = requis.filter((a) => !fournis.has(a));
  return {
    requisManquants,
    souhaitesManquants: souhaites.filter((a) => !fournis.has(a)),
    ok: requisManquants.length === 0,
  };
}

/** Documents à envoyer à l'extraction pour un apport donné, doublons de forme ÉCARTÉS. */
export function documentsPour(index: readonly IndexDocument[], apport: Apport): IndexDocument[] {
  return index.filter((d) => !d.doublonDe && d.apports.includes(apport));
}

/** Documents qu'on n'analyse PAS : rien d'utile, ou doublon de forme d'un autre. */
export function documentsIgnores(index: readonly IndexDocument[]): IndexDocument[] {
  return index.filter((d) => Boolean(d.doublonDe) || (d.apports.length === 1 && d.apports[0] === "aucun"));
}

/**
 * Message de refus pour un apport REQUIS absent — actionnable, comme les refus du
 * garde-fou (§3bis) : il dit quoi demander, pas seulement que ça manque.
 */
const DEMANDE_PAR_APPORT: Partial<Record<Apport, string>> = {
  lots_descriptif: "l'état descriptif de division (EDD) ou le règlement de copropriété",
  tantiemes_par_lot: "les tableaux de répartition des tantièmes par lot, pour chaque clé",
  owners_adresses: "la liste des copropriétaires avec leurs adresses, ou la feuille de présence de la dernière AG",
  attributions: "la feuille de présence de la dernière AG (elle relie les lots à leurs propriétaires)",
  ecritures_comptables: "le grand livre de l'exercice (PDF natif, pas un scan)",
  tva_deductible_par_facture: "le relevé général des dépenses (RGD), qui porte la TVA et la part déductible",
  appels_de_fonds_par_cle: "les appels de fonds par clé de répartition",
  quotes_parts_450: "l'état de répartition par compte de copropriétaire (450)",
};

export function messageApportManquant(apport: Apport): string {
  const quoi = DEMANDE_PAR_APPORT[apport];
  const cible = quoi ?? `un document portant « ${apport} »`;
  return `Aucun document fourni n'apporte « ${apport} ». Demander à l'ancien syndic ${cible}.`;
}
