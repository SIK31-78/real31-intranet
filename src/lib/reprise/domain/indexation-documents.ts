// Domaine PUR de l'INDEXATION des documents (aucune I/O, aucun import technique).
// Étape 2 du chantier extraction (étude §1.2). Remplace le routage par regex sur le NOM.
//
// CE QUI NE MARCHAIT PAS. `pourStructure` contenait `rgdd` (deux d) quand le sigle métier
// est RGD, « relevé général des dépenses » en clair n'était capté par rien, et tout ce qui
// ne matchait aucune regex tombait en ANNEXE (un appel IA chacun, pour rien). Résultat
// mesuré sur S0306 : 6 documents correctement routés sur 14 ; les deux RGD texte, le RGD
// scanné et la fiche de synthèse n'ont jamais atteint le bon pipeline.
//
// LE PRINCIPE. On détecte sur le CONTENU (texte des premières pages, en-têtes de tableaux),
// le nom de fichier n'étant qu'un INDICE FAIBLE — il ne peut ni créer ni retirer un apport
// à lui seul, il ne fait que départager. Trois étages, du gratuit vers le payant : ces
// heuristiques (0 token) d'abord, un petit modèle en repli sur les documents indécis, et
// l'humain en dernier ressort. Ce module est l'étage 1.

import type { Apport, FormeDocument, IndexDocument } from "@/lib/reprise/domain/apports";

/** Un document à indexer : son nom, sa forme, et ce qu'on a pu lire de son texte. */
export interface DocumentAIndexer {
  nom: string;
  /** Texte extrait (couche texte ou OCR). Vide = scan muet, on ne peut rien conclure. */
  texte: string;
  /** Nombre de pages, si connu. */
  pages?: number;
}

/** Normalise pour la détection : minuscules, sans accents, espaces réduits. */
function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Une règle de détection d'apport. `motifs` cherche dans le TEXTE (l'autorité) ; `indices`
 * ne cherche que dans le NOM et ne suffit JAMAIS seul à poser l'apport — il ne sert qu'à
 * départager un texte muet (scan) où le contenu ne dit rien.
 */
interface RegleApport {
  apport: Apport;
  /** Le contenu porte cet apport (l'un des motifs suffit). */
  motifs: RegExp[];
  /** Indices de nom de fichier, utilisés SEULEMENT si le texte est muet. */
  indices?: RegExp[];
}

// Séries d'écritures : au moins quelques nomenclatures de comptes en début de ligne.
const SERIE_COMPTES = /(^|\n)\s*[1-7]\d{5,6}\b/;
const COLONNE_TANTIEMES = /\b(tanti[eè]mes?|milli[eè]mes?)\b/;

const REGLES: RegleApport[] = [
  {
    apport: "ecritures_comptables",
    motifs: [/\bgrand[- ]livre\b/, /\bbalance g[eé]n[eé]rale\b/, /\bjournal (general|des ecritures)\b/, SERIE_COMPTES],
    indices: [/\bgrand[-_ ]?livre\b/, /(^|[\s_-])gl($|[\s_.-])/, /\bbalance\b/, /\bjournal\b/],
  },
  {
    apport: "tva_deductible_par_facture",
    // Le sigle RGD (pas RGDD) ET la forme en clair, qui n'etait captee par rien.
    motifs: [/\brgd{1,2}\b/, /relev[eé] g[eé]n[eé]ral des d[eé]penses/, /\bt\.?v\.?a\.?\b.{0,40}\bd[eé]ductible/],
    indices: [/\brgd{1,2}\b/, /relev[eé]?[-_ ]?general[-_ ]?(des[-_ ]?)?depenses/, /etat[-_ ]?detaille/],
  },
  {
    apport: "cles_utilisees_en_compta",
    motifs: [/r[eé]partition (generale )?des (charges|depenses)/, /\bcl[eé]s? de r[eé]partition\b/, /\bannexe [1-6]\b/],
    indices: [/\bannexes?\b/, /\brgd{1,2}\b/, /repartition/],
  },
  {
    apport: "tantiemes_par_lot",
    // Un tableau de tantiemes : la colonne tantieme ET une colonne de lots.
    motifs: [
      new RegExp(`${COLONNE_TANTIEMES.source}[\\s\\S]{0,200}\\b(n[o°]?\\s?de\\s?lot|lot n|numero de lot)\\b`),
      new RegExp(`\\b(n[o°]?\\s?de\\s?lot|lot n)\\b[\\s\\S]{0,200}${COLONNE_TANTIEMES.source}`),
    ],
    indices: [/\brcp\b/, /\bedd\b/, /repartition/, /feuille[-_ ]?de[-_ ]?presence/],
  },
  {
    apport: "perimetre_cles",
    motifs: [/r[eè]glement de coproprie?t[eé]/, /charges communes (generales|speciales)/, /\bmodificatif\b/],
    indices: [/\brcp\b/, /reglement/, /modificatif/],
  },
  {
    apport: "lots_descriptif",
    motifs: [/[eé]tat descriptif de division/, /\blot n[o°]?\s?\d+/, /\bdesignation des lots\b/],
    indices: [/\bedd\b/, /descriptif/, /\brcp\b/, /feuille[-_ ]?de[-_ ]?presence/],
  },
  {
    apport: "owners_adresses",
    motifs: [/feuille de pr[eé]sence/, /liste des copropri[eé]taires/, /\bcopropri[eé]taire\b[\s\S]{0,80}\badresse\b/],
    indices: [/feuille[-_ ]?de[-_ ]?presence/, /copropri?etaires?/, /\bfdp\b/],
  },
  {
    apport: "attributions",
    motifs: [/feuille de pr[eé]sence/],
    indices: [/feuille[-_ ]?de[-_ ]?presence/, /\bfdp\b/],
  },
  {
    apport: "totaux_tantiemes_par_owner",
    motifs: [/nombre de tanti[eè]mes/, /total(?: des)? tanti[eè]mes/],
    indices: [/feuille[-_ ]?de[-_ ]?presence/],
  },
  {
    apport: "votants_avec_tantiemes",
    motifs: [/proc[eè]s[- ]verbal/, /\bassemblee generale\b[\s\S]{0,200}\b(voix|pour|contre)\b/],
    indices: [/\bpv\b/, /proces[-_ ]?verbal/],
  },
  {
    apport: "nb_lots_batiments",
    motifs: [/fiche de synth[eè]se/, /nombre de lots/, /nombre de b[aâ]timents/],
    indices: [/fiche[-_ ]?synthese/],
  },
  {
    apport: "quotes_parts_450",
    motifs: [/\b450\d{3,}\b/, /r[eé]partition par compte/, /compte de copropri[eé]taire/],
    indices: [/convocation/],
  },
  {
    apport: "appels_de_fonds_par_cle",
    motifs: [/appels? de fonds/],
    indices: [/appels?[-_ ]?de[-_ ]?fonds/],
  },
  {
    apport: "debiteurs_crediteurs",
    motifs: [/\bd[eé]biteurs?\b/, /\bcr[eé]diteurs?\b/, /impay[eé]s/],
  },
  { apport: "budgets", motifs: [/budget pr[eé]visionnel/, /\bbudget vot[eé]\b/], indices: [/\bbudget\b/] },
  { apport: "date_effet_contrat", motifs: [/contrat de syndic/, /date d'effet/], indices: [/contrat/] },
  { apport: "codes_estale", motifs: [/\bowner[- ]?list\b/, /\bref(erence)? estale\b/], indices: [/owners?[-_ ]?list/] },
];

/** Année d'exercice détectée (texte d'abord, nom en repli) — discrimine les doublons. */
function anneeDe(doc: DocumentAIndexer): string | undefined {
  const dansTexte = normaliser(doc.texte).match(/\b(20[12]\d)\b/);
  if (dansTexte) return dansTexte[1];
  return doc.nom.match(/\b(20[12]\d)\b/)?.[1];
}

/**
 * Indexe UN document. `forme` est déduite de la présence d'un texte exploitable : un scan
 * muet n'a pas de couche texte. Un document dont aucun apport ne ressort reçoit `aucun` —
 * le DROIT DE NE RIEN ANALYSER, qui est une économie directe (un appel IA en moins).
 */
export function indexerDocument(doc: DocumentAIndexer): IndexDocument {
  const texte = normaliser(doc.texte);
  const nom = normaliser(doc.nom);
  // Seuil bas mais non nul : quelques caracteres d'OCR residuel ne font pas une couche texte.
  const forme: FormeDocument = texte.trim().length >= 200 ? "texte" : "scan";

  const parContenu = REGLES.filter((r) => r.motifs.some((m) => m.test(texte))).map((r) => r.apport);
  // Le NOM ne parle QUE si le contenu est muet : il ne peut jamais contredire un texte lu.
  const parNom =
    parContenu.length === 0
      ? REGLES.filter((r) => (r.indices ?? []).some((m) => m.test(nom))).map((r) => r.apport)
      : [];

  const apports = [...new Set([...parContenu, ...parNom])];
  const motif =
    parContenu.length > 0
      ? "detecte sur le contenu"
      : parNom.length > 0
        ? "contenu muet (scan) : deduit du nom de fichier, a confirmer"
        : "aucun apport detecte";

  return {
    nom: doc.nom,
    forme,
    apports: apports.length > 0 ? apports : ["aucun"],
    motif,
  };
}

/**
 * Indexe un LOT et marque les doublons de FORME (même document, scan vs texte).
 *
 * Règle de prudence : on ne marque un doublon que si la signature concorde — MÊMES apports
 * ET MÊME année d'exercice — et on garde la version à COUCHE TEXTE comme référence (gratuit
 * en fiabilité comme en coût). Quand l'année n'est pas déterminable, on ne marque RIEN :
 * écarter un document à tort perdrait ses données, ce qui est bien pire que de l'analyser
 * deux fois. C'est la limite honnête de cette heuristique.
 */
export function indexerLot(docs: readonly DocumentAIndexer[]): IndexDocument[] {
  const index = docs.map(indexerDocument);
  const annees = new Map(docs.map((d) => [d.nom, anneeDe(d)]));

  const groupes = new Map<string, IndexDocument[]>();
  for (const d of index) {
    if (d.apports.length === 1 && d.apports[0] === "aucun") continue;
    const annee = annees.get(d.nom);
    if (!annee) continue; // annee inconnue -> jamais de doublon presume
    const signature = `${annee}|${[...d.apports].sort().join(",")}`;
    groupes.set(signature, [...(groupes.get(signature) ?? []), d]);
  }

  for (const groupe of groupes.values()) {
    if (groupe.length < 2) continue;
    // Reference = une version a couche texte s'il en existe une, sinon la premiere.
    const reference = groupe.find((d) => d.forme === "texte") ?? groupe[0]!;
    for (const d of groupe) {
      if (d === reference) continue;
      d.doublonDe = reference.nom;
      d.motif = `doublon de forme de « ${reference.nom} » (${reference.forme} prefere a ${d.forme})`;
    }
  }
  return index;
}
