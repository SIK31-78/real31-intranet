// Tri des e-mails V2 (ADR-046) : l'intranet lit la boite de reception d'une boite
// partagee generique et PROPOSE une copropriete ESTALE pour chaque mail ; au clic, le
// mail part dans le sous-dossier du gestionnaire (increment 2). On repond dans Outlook.
// Domaine pur : aucune lecture d'env, aucun appel reseau -> testable tel quel.
//
// Perimetre : les coproprietes ESTALE ET Crypto des agences de la boite (decision Sekou du
// 12/10/2026, avant la migration ; une boite par agence ou groupe d'agences depuis le
// 27/10/2026, config MAIL_TRI_BOITES). Un mail qui cite une copro
// hors de ce perimetre est signale « hors périmètre », jamais rattache. Le code de nature
// reste "hors-estale" : il est deja ecrit dans le journal.

import { cleRecherche } from "./recherche-copro-tolerante";

/** Une personne de l'equipe ESTALE d'une copro. */
export interface MembreTri {
  nomComplet: string;
  email: string;
}

/** Une copropriete ESTALE telle que le tri la connait. */
export interface CoproTri {
  /** Reference ESTALE, ex "S0297" ou "SE999". */
  reference: string;
  nom: string;
  /** Adresse sur une ligne, ex "12 rue des Recollets 31000 Toulouse" ; "" si inconnue. */
  adresse: string;
  /** Gestionnaire designe par le mandat ESTALE. null = mandat sans gestionnaire. */
  gestionnaire: MembreTri | null;
  /** Assistant de copropriete, seulement si ESTALE le connait (rare au 25/09/2026). */
  assistant: MembreTri | null;
  /** D'ou vient la copro : ESTALE, ou le referentiel de l'intranet pour une copro Crypto. */
  source?: SourceTri;
  /** Numero d'immatriculation au Registre National des Coproprietes (ex "AA6459523"), s'il est connu. */
  immatriculation?: string;
  /**
   * Noms d'usage au registre national (RNIC), joint par l'immatriculation : « Le Clos Martin »
   * quand Crypto ecrit « LECLOS_BCD ». Reconnus comme le nom, avec des garde-fous plus stricts.
   */
  nomsUsage?: string[];
  /**
   * Autres adresses de la copro au registre national (adresse de reference et adresses
   * complementaires), sur une ligne avec code postal et ville. Reconnues comme l'adresse.
   */
  adressesSecondaires?: string[];
  /**
   * Noms des coproprietaires ESTALE (« Dupont Jean »), pour retrouver la copro en tapant l'un
   * d'eux dans le choix de copro (28/10/2026). Les noms seuls : jamais leurs adresses e-mail.
   * Depuis le 03/11/2026, aussi ceux de l'annuaire Crypto (coproprietaires et conseil syndical).
   */
  coproprietaires?: string[];
  /** Noms des locataires de l'annuaire Crypto (03/11/2026), pour la meme recherche. */
  locataires?: string[];
  /**
   * Copro INACTIVE dans l'intranet (mandat termine) : on recoit encore des mails de l'ancien
   * syndic, de coproprietaires, de locataires. Reconnue, mais au plus en piste faible.
   */
  inactive?: boolean;
  /**
   * Code de l'agence de la copro (HLS, LGC...), quand la source le dit : etablissement ESTALE
   * (« REAL 31 - LGC »), agence de la fiche Crypto. Borne le referentiel d'une boite triee a
   * ses agences (V2 du tri, 27/10/2026).
   */
  agence?: string;
}

export type SourceTri = "estale" | "crypto";

/** Pourquoi une adresse e-mail est connue d'une copro dans ESTALE. */
export type QualiteExpediteur =
  | "copropriétaire"
  | "conseil syndical"
  | "locataire"
  | "mandataire"
  | "notaire"
  | "fournisseur";

export interface LienExpediteur {
  reference: string;
  qualite: QualiteExpediteur;
  /** Ou l'adresse est connue ; ESTALE par defaut. */
  source?: SourceTri;
}

/** Le referentiel du tri : les copros et l'index adresse -> copros. */
export interface ReferentielTri {
  copros: CoproTri[];
  /** Cle = adresse e-mail en minuscules. */
  expediteurs: Record<string, LienExpediteur[]>;
  /** Une source n'a pas repondu : le tri marche avec l'autre, l'ecran le dit. */
  avertissements?: string[];
  /**
   * Les prestataires ESTALE de chaque copro (cle = reference de la copro), pour proposer leurs
   * contacts comme destinataires dans les E-mails (02/11/2026). Meme requete que l'index des
   * expediteurs, rien de plus a lire. Absent : source sans prestataires (Crypto) ou ESTALE en panne.
   */
  prestataires?: Record<string, PrestataireCopro[]>;
}

/** Un contact d'un prestataire (fournisseur) ESTALE d'une copro. */
export interface PrestataireCopro {
  /** Nom du contact (« Jean Martin », parfois « Accueil ») ; "" si ESTALE ne le donne pas. */
  nom: string;
  /** Nom de l'entreprise (fournisseur ESTALE), ex « DGP NETTOYAGE ». */
  entreprise: string;
  /** En minuscules. */
  email: string;
}

/**
 * Le referentiel de la boite : les copros ESTALE et les copros Crypto, fusionnees par code
 * (S0300 dans ESTALE = S300 dans Crypto). Pour une copro presente des deux cotes, ESTALE
 * fait foi (equipe du mandat), Crypto complete ce qu'il ne sait pas (l'assistant).
 * `perimetre` (cles de reference) borne le resultat a l'agence de la boite ; null = tout.
 */
export function fusionnerReferentiels(
  estale: ReferentielTri | null,
  crypto: ReferentielTri | null,
  perimetre: Set<string> | null,
): ReferentielTri {
  const dans = (reference: string) => {
    const cle = cleDeReference(reference);
    return cle !== null && (perimetre === null || perimetre.has(cle));
  };
  const parCle = new Map<string, CoproTri>();
  for (const c of estale?.copros ?? []) if (dans(c.reference)) parCle.set(cleDeReference(c.reference)!, { ...c, source: c.source ?? "estale" });
  for (const c of crypto?.copros ?? []) {
    if (!dans(c.reference)) continue;
    const cle = cleDeReference(c.reference)!;
    const deja = parCle.get(cle);
    parCle.set(
      cle,
      deja
        ? {
            ...deja,
            gestionnaire: deja.gestionnaire ?? c.gestionnaire,
            assistant: deja.assistant ?? c.assistant,
            adresse: deja.adresse || c.adresse,
            immatriculation: deja.immatriculation ?? c.immatriculation,
            nomsUsage: deja.nomsUsage ?? c.nomsUsage,
            adressesSecondaires: deja.adressesSecondaires ?? c.adressesSecondaires,
            agence: deja.agence ?? c.agence,
            // Les noms des deux sources, sans doublon (03/11/2026) : ESTALE ne connait que les
            // coproprietaires des copros migrees, l'annuaire Crypto les autres et les locataires.
            ...unirNoms("coproprietaires", deja.coproprietaires, c.coproprietaires),
            ...unirNoms("locataires", deja.locataires, c.locataires),
          }
        : { ...c, source: "crypto" },
    );
  }

  const expediteurs: Record<string, LienExpediteur[]> = {};
  const ajouter = (index: Record<string, LienExpediteur[]> | undefined, source: SourceTri) => {
    for (const [email, liens] of Object.entries(index ?? {})) {
      for (const l of liens) {
        const copro = parCle.get(cleDeReference(l.reference) ?? "");
        if (!copro) continue;
        const liste = (expediteurs[email] ??= []);
        if (!liste.some((x) => x.reference === copro.reference && x.qualite === l.qualite)) {
          liste.push({ reference: copro.reference, qualite: l.qualite, source: l.source ?? source });
        }
      }
    }
  };
  ajouter(estale?.expediteurs, "estale");
  ajouter(crypto?.expediteurs, "crypto");

  // Les prestataires ESTALE suivent leur copro, dans le perimetre, sous sa reference finale (02/11/2026).
  const prestataires: Record<string, PrestataireCopro[]> = {};
  for (const [reference, liste] of Object.entries(estale?.prestataires ?? {})) {
    const copro = parCle.get(cleDeReference(reference) ?? "");
    if (copro && liste.length) prestataires[copro.reference] = [...(prestataires[copro.reference] ?? []), ...liste];
  }

  return {
    copros: [...parCle.values()],
    expediteurs,
    ...(Object.keys(prestataires).length ? { prestataires } : {}),
    avertissements: [...(estale?.avertissements ?? []), ...(crypto?.avertissements ?? [])],
  };
}

/**
 * Deux listes de noms reunies sans doublon (« Dupont Jean » = « DUPONT JEAN »), la premiere
 * d'abord ; rien si les deux sont vides, pour ne pas alourdir la copro d'une liste vide.
 */
function unirNoms<K extends "coproprietaires" | "locataires">(cle: K, a: string[] | undefined, b: string[] | undefined): Partial<Record<K, string[]>> {
  const vus = new Set<string>();
  const noms: string[] = [];
  for (const n of [...(a ?? []), ...(b ?? [])]) {
    const k = cleRecherche(n);
    if (!k || vus.has(k)) continue;
    vus.add(k);
    noms.push(n);
  }
  return noms.length ? ({ [cle]: noms } as Partial<Record<K, string[]>>) : {};
}

/** Un mail de la file a trier (boite de reception de la generique). */
export interface MailATrier {
  /** Id Graph courant (sert a ouvrir le mail et, a l'increment 2, a le deplacer). */
  id: string;
  internetMessageId: string;
  conversationId?: string;
  deNom: string;
  deAdresse: string;
  /** Destinataires (To) : utile pour voir si le mail nous est adressé ou en copie/transfert. */
  a?: string[];
  /** Mail interne : réponse d'un collègue où la boîte partagée est restée en copie. À corbeille. */
  interne?: boolean;
  /** Reponse automatique ou publicite apprise : le tri propose la corbeille (motifCorbeille). */
  corbeille?: MotifCorbeille;
  /**
   * Avis de non-remise d'un mail envoye (estAvisNonRemis) : un coproprietaire a une adresse
   * mail fausse. Plus jamais propose a la corbeille (decision Sekou du 03/11/2026) : il part au
   * binome de la copro concernee, qui rappelle le coproprietaire.
   */
  nonRemis?: true;
  objet: string;
  /** ISO 8601. */
  recuLe: string;
  apercu: string;
  aPiecesJointes: boolean;
  /** Lien pour ouvrir le mail dans Outlook sur le web ; absent pour l'echantillon. */
  lienOutlook?: string;
}

export type NatureSuggestion =
  /** Une seule copro ESTALE, par un indice fort (code dans l'objet, expediteur connu d'une seule copro). */
  | "sure"
  /** Plusieurs copros possibles : on laisse choisir. */
  | "plusieurs"
  /** Un indice faible (code dans le corps) : a confirmer. */
  | "faible"
  /** Le mail cite une copro qui n'est pas sur ESTALE. */
  | "hors-estale"
  | "aucune";

export interface Suggestion {
  nature: NatureSuggestion;
  /** References ESTALE candidates, la plus probable d'abord. Vide si aucune / hors ESTALE. */
  candidats: string[];
  /** Phrase affichee telle quelle : d'ou vient la suggestion. */
  raison: string;
  /**
   * D'ou vient la piste, quand ce n'est pas le contenu ordinaire du mail :
   *   - « conversation » : la seule piste vient d'un mail de la meme conversation deja range
   *     (journal : « conversation ») ;
   *   - « nom-adresse » : piste faible sur UNE copro, trouvee par le nom de l'immeuble, son
   *     adresse, ou un nom d'usage / une adresse du registre national, sans aucun code de
   *     copro cite (decision Sekou du 26/10/2026 : rangeable sans clic, cf. pisteRangeable).
   *     Jamais pour un fournisseur seul, un code dans le corps, l'historique de la conversation ;
   *   - « code-corps » : piste faible sur UNE copro, par son code cite dans le corps du mail
   *     (etude du tri v2, 03/11/2026 : 7 justes sur 7, rangeable sans clic) ;
   *   - « adresse-sans-lieu » : piste faible sur UNE copro, par son adresse citee sans ville
   *     ni code postal, sur une rue qu'une seule ville du referentiel connait (meme etude :
   *     22 justes sur 22, rangeable sans clic).
   */
  origine?: OrigineSuggestion;
  /**
   * La piste vient d'un identifiant explicite de la copro : son code cite dans l'objet, ou son
   * numero d'immatriculation. Pour une copro INACTIVE (plafonnee a « faible »), c'est la seule
   * piste qui la range sans clic (decision du 28/10/2026, rangeableAutomatiquement).
   */
  identifiant?: true;
  /**
   * Le mail ne designe aucune copro de la boite, mais UNE copro d'une autre agence
   * (proposerAutreAgence, 03/11/2026). La nature reste « aucune ». Piste vraiment sure
   * (`sure`, pisteAutreAgenceStricte) : la tache planifiee le bascule seule vers l'agence de
   * la copro (basculeAutomatique) ; sinon l'ecran propose de le basculer.
   */
  autreAgence?: { reference: string; agence: string | null; sure?: true };
}

export type OrigineSuggestion = "conversation" | "nom-adresse" | "code-corps" | "adresse-sans-lieu" | "jumelle";

/**
 * Copros JUMELLES (decision Sekou du 03/11/2026) : deux fiches distinctes voulues, a ne pas
 * fusionner, que les mails designent souvent ensemble (meme adresse). Quand un mail hesite
 * entre les deux fiches d'une paire, il est range sur la fiche PRINCIPALE (son binome
 * redistribue), sauf si le texte designe clairement la secondaire : son code ou son nom exact,
 * ou l'un de ses marqueurs (sur le texte sans accents, en minuscules).
 * Laquelle est principale : propose par la coordination, a confirmer par Sekou ; il suffit
 * d'echanger `principale` et `secondaire` ici (et d'adapter les marqueurs).
 */
export const COPROS_JUMELLES: readonly { principale: string; secondaire: string; marqueursSecondaire: RegExp; libelle: string }[] = [
  // 34/36 rue Sartoris : SARTO34 A et SARTO34 B (« Les Lofts Sartoris B & C »).
  { principale: "S123", secondaire: "S124", marqueursSecondaire: /\bbat(?:iment)?\.?\s*b\b|\bsarto\s?34\s*b\b|\blofts sartoris b\b/, libelle: "SARTO34 A / B" },
  // 152 avenue Gabriel Peri a Bezons : le SDC Le Plazza et l'ASL.
  { principale: "S198", secondaire: "S204", marqueursSecondaire: /\basl\b|\baslplazza\b/, libelle: "SDC Le Plazza / ASL" },
  // 20 avenue de Verdun : l'habitation et les parkings.
  { principale: "S143", secondaire: "S142", marqueursSecondaire: /\bparkings?\b|\bbox\b|\belegance p\b/, libelle: "Élégance habitation / parkings" },
];

// "S0297", "S297", "SE999" -> cle de comparaison "S297" / "SE999". ESTALE ecrit S0297 ;
// les mails et d'autres outils ecrivent parfois S297 : la cle ignore les zeros de tete.
// 3 chiffres minimum et pas d'espace : "S1" (sous-sol) ou "batiment S 12" ne sont pas
// des references. Le \b evite de prendre "S0297" dans "RS02971".
const MOTIF_REFERENCE = /\b(SE|S)(\d{3,4})\b/gi;

function cleReference(prefixe: string, chiffres: string): string {
  return `${prefixe.toUpperCase()}${Number(chiffres)}`;
}

/** Cle de comparaison d'une reference ESTALE ("S0297" -> "S297"). null si ce n'en est pas une. */
export function cleDeReference(reference: string): string | null {
  const m = /^(SE|S)(\d{3,4})$/i.exec(reference.trim());
  return m ? cleReference(m[1]!, m[2]!) : null;
}

/** Les cles de reference citees dans un texte, dans l'ordre d'apparition, sans doublon. */
export function referencesCitees(texte: string): string[] {
  const vues: string[] = [];
  for (const m of texte.matchAll(MOTIF_REFERENCE)) {
    const cle = cleReference(m[1]!, m[2]!);
    if (!vues.includes(cle)) vues.push(cle);
  }
  return vues;
}

// Numero d'immatriculation au Registre National des Coproprietes : 2 lettres + 6 a 8 chiffres
// (ex "AA6459523"). Identifiant UNIQUE d'une copro : la reconnaitre vaut un indice sur. Les
// mails de l'ANAH (anah.gouv.fr) le citent systematiquement (40 % d'une boite comme syndic1).
const MOTIF_IMMATRICULATION = /\b([A-Za-z]{2}\d{6,8})\b/g;

/** References des copros dont l'immatriculation RNC est citee dans le texte (comparaison insensible a la casse). */
export function coprosParImmatriculation(texte: string, copros: CoproTri[]): string[] {
  const parImmat = new Map<string, string>();
  for (const c of copros) if (c.immatriculation) parImmat.set(c.immatriculation.toUpperCase(), c.reference);
  const refs: string[] = [];
  for (const m of texte.matchAll(MOTIF_IMMATRICULATION)) {
    const ref = parImmat.get(m[1]!.toUpperCase());
    if (ref && !refs.includes(ref)) refs.push(ref);
  }
  return refs;
}

// Mots trop courants pour identifier une copro : type de voie, articles, termes generiques
// d'un nom d'immeuble. Un mot restant (« CYRANO », « MICHELET ») est, lui, distinctif.
const MOTS_BANALS = new Set([
  "residence", "copropriete", "syndicat", "immeuble", "batiment", "villa", "clos", "parc",
  "jardin", "jardins", "cour", "square", "hameau", "domaine", "lotissement", "ensemble", "foncier",
  "rue", "avenue", "boulevard", "place", "allee", "allees", "impasse", "chemin", "passage", "quai",
  "route", "cours", "sente", "sentier", "voie", "ruelle",
  "les", "le", "la", "des", "de", "du", "et", "aux", "au", "sur", "sous", "saint", "sainte", "mon", "ma",
]);

// Longueur de corps lue pour la reconnaissance nom/adresse : assez pour l'objet du mail,
// trop courte pour atteindre la signature (ou figure l'adresse du cabinet). Mesure du 13/10.
const TETE_CORPS = 600;

// Liens et images collés par Outlook dans le texte d'un mail : « <https://eur01.safelinks…> »
// (Safelinks, souvent plus de 300 caractères), « [cid:image001.png@…] ». Audit du journal du
// tri (19/10/2026) : ils mangeaient les TETE_CORPS caractères lus, si bien que le nom de
// l'immeuble, écrit juste après, n'était jamais atteint. On les retire avant toute analyse.
const LIENS_COLLES = /<(?:https?|mailto):[^>]*>|https?:\/\/\S+|\[cid:[^\]]*\]/gi;

/** Le texte d'un mail sans les liens (Safelinks, mailto) ni les images en ligne ([cid:…]). */
export function nettoyerCorps(texte: string): string {
  return texte.replace(LIENS_COLLES, "");
}

function normaliser(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Mots porteurs de sens d'un libelle (>= 4 lettres, ni banals ni purement numeriques). */
function motsSignificatifs(s: string): string[] {
  return [...new Set(normaliser(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !MOTS_BANALS.has(t) && !/^\d+$/.test(t)))];
}

// Les types de voie reconnus. On matche une adresse sur ses MOTS (type + nom de rue), pas en
// bloc exact : « 86 rue E Vaillant » en base doit matcher « 86 rue Edouard Vaillant » dans le
// mail (abreviation), et une adresse composee « X - Y » doit matcher par l'une ou l'autre rue.
const TYPES_VOIE = ["boulevard", "avenue", "impasse", "passage", "sentier", "ruelle", "chemin", "allees", "allee", "square", "route", "place", "quai", "voie", "cours", "sente", "rue"];

// Segments de voie d'une adresse (avant le code postal), chacun = son type + ses mots de rue
// porteurs de sens. "86 rue E Vaillant - 89-91 rue M Berteaux 95870" -> [rue:[vaillant], rue:[berteaux]].
const RE_TYPES_VOIE = TYPES_VOIE.map((t) => [t, new RegExp(`\\b${t}\\b`)] as const);

// Abreviations de type de voie, lues comme le mot entier, dans le mail comme en base : « 85 bd
// National » (mail de Rueil, S269, 19/10/2026) doit valoir « boulevard National ». Le risque
// d'un « r » ou d'un « pl » isole reste faible : il faut aussi les mots de la rue, le lieu et
// le numero.
const ABREVIATIONS_VOIE: Readonly<Record<string, string>> = {
  bd: "boulevard", bld: "boulevard", blvd: "boulevard", bvd: "boulevard", boul: "boulevard",
  av: "avenue", ave: "avenue", r: "rue", pl: "place", imp: "impasse", ch: "chemin", che: "chemin",
  chem: "chemin", all: "allee", sq: "square", rte: "route", pass: "passage", crs: "cours",
};

function deplierVoie(mot: string): string {
  return ABREVIATIONS_VOIE[mot] ?? mot;
}
// Le découpage d'une adresse est déterministe : mémoïsé (le moteur le redemande pour chaque
// copro et chaque mail ; LGC = 144 copros x 100 mails par affichage).
const cacheVoies = new Map<string, { type: string; mots: string[] }[]>();

function voiesDe(adresse: string): { type: string; mots: string[] }[] {
  const deja = cacheVoies.get(adresse);
  if (deja) return deja;
  const avantCP = normaliser(adresse).split(/\b\d{5}\b/)[0] ?? "";
  const voies = avantCP
    // Un trait d'union entre deux lettres lie un nom compose (« rue Jean-Baptiste Lafolie »,
    // 28/10/2026) : on ne coupe que celui qui separe deux adresses (« 86 rue X - 89 rue Y »).
    .split(/-(?![a-z])|(?<![a-z])-|[/,;]| et /)
    .map((seg) => {
      const n = seg.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().split(" ").map(deplierVoie).join(" ");
      const type = RE_TYPES_VOIE.find(([, re]) => re.test(n))?.[0];
      const mots = n.split(" ").filter((t) => t.length >= 4 && !MOTS_BANALS.has(t) && !/^\d+$/.test(t));
      return type && mots.length ? { type, mots } : null;
    })
    .filter((x): x is { type: string; mots: string[] } => x !== null);
  cacheVoies.set(adresse, voies);
  return voies;
}

// La ville d'une adresse : apres le code postal. Sert a retirer du nom de l'immeuble les mots
// qui ne sont que son lieu (« Les Jardins de Bezons » a Bezons ne doit pas matcher tout
// mail citant Bezons) ET a exiger le lieu quand on matche sur l'adresse.
function villeDe(adresse: string): string {
  return (normaliser(adresse).split(/\b\d{5}\b/)[1] ?? "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// Types de voie qui font d'un « nom » ESTALE une adresse (« 12 RUE DE BEZONS »). Pas « square »,
// « cours », « passage » ni « voie » : ils commencent aussi des noms de residence (« Le Square »).
const VOIES_DANS_UN_NOM = new Set(["rue", "avenue", "av", "bd", "bld", "boulevard", "place", "chemin", "allee", "allees", "impasse", "quai", "route", "sente", "sentier", "ruelle"]);

function nomEstAdresse(nom: string): boolean {
  return normaliser(nom).split(/[^a-z0-9]+/).some((t) => VOIES_DANS_UN_NOM.has(t));
}

// Les mots de ville de tout le referentiel : « Bezons » dans le nom d'une copro de Houilles
// n'est pas plus distinctif que dans celui d'une copro de Bezons. Memoise par referentiel.
const cacheVilles = new WeakMap<CoproTri[], Set<string>>();

function villesDu(copros: CoproTri[]): Set<string> {
  const deja = cacheVilles.get(copros);
  if (deja) return deja;
  const villes = new Set(copros.flatMap((c) => [c.adresse, ...(c.adressesSecondaires ?? [])].flatMap((a) => motsSignificatifs(villeDe(a)))));
  cacheVilles.set(copros, villes);
  return villes;
}

// Numeros de rue d'une adresse, avant le code postal : « 89-91 rue M Berteaux » -> 89, 90, 91 ;
// « 12/14/16 rue G Flaubert » -> 12, 14, 16 ; « 1 bis » -> 1. Memoise comme les voies.
const cacheNumeros = new Map<string, Set<string>>();

function numerosDe(adresse: string): Set<string> {
  const deja = cacheNumeros.get(adresse);
  if (deja) return deja;
  const avantCP = normaliser(adresse).split(/(?:^|[^0-9])[0-9]{5}(?:[^0-9]|$)/)[0] ?? "";
  const numeros = new Set<string>();
  for (const m of avantCP.matchAll(/[0-9]{1,4}/g)) numeros.add(String(Number(m[0])));
  for (const m of avantCP.matchAll(/([0-9]{1,4}) *- *([0-9]{1,4})/g)) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (b > a && b - a < 30) for (let n = a; n <= b; n++) numeros.add(String(n));
  }
  cacheNumeros.set(adresse, numeros);
  return numeros;
}

// Mots de rue partages : un mot de rue porte par au moins RUE_PARTAGEE_MIN copros du
// referentiel (« Gallieni », « Republique ») ne suffit plus a reconnaitre une copro par son NOM
// (28/10/2026) : « avenue Gallieni » dans un mail designait la residence « Gallieni » d'une
// autre adresse. Il reste reconnu dans l'adresse (type, numero, lieu). Memoise par referentiel.
const RUE_PARTAGEE_MIN = 2;
const cacheRuesPartagees = new WeakMap<CoproTri[], Set<string>>();

function ruesPartagees(copros: CoproTri[]): Set<string> {
  const deja = cacheRuesPartagees.get(copros);
  if (deja) return deja;
  const compte = new Map<string, number>();
  for (const c of copros) {
    const siens = new Set([c.adresse, ...(c.adressesSecondaires ?? [])].flatMap((a) => voiesDe(a).flatMap((v) => v.mots)));
    for (const m of siens) compte.set(m, (compte.get(m) ?? 0) + 1);
  }
  const rues = new Set([...compte].filter(([, n]) => n >= RUE_PARTAGEE_MIN).map(([m]) => m));
  cacheRuesPartagees.set(copros, rues);
  return rues;
}

// Le registre national suffixe parfois le nom d'usage de son numero de syndic (« LES TILLEULS -
// MS123456 ») : ce n'est pas un nom, on le retire avant de chercher le nom dans le mail.
function sansSuffixeRegistre(nom: string): string {
  return nom.replace(/\s*-?\s*\bMS\d{5,}\b/gi, "").trim();
}

/** Les deux mots ne different-ils que d'une lettre (remplacee, ajoutee ou retiree) ? */
function uneLettreDEcart(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [court, long] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < court.length && court[i] === long[i]) i++;
  // Meme longueur : une substitution ; sinon, la lettre en trop du plus long.
  return court.length === long.length ? court.slice(i + 1) === long.slice(i + 1) : court.slice(i) === long.slice(i + 1);
}

// Une faute de frappe dans le nom de rue (« Marcel SAMBAT » pour « Marcel Sembat », S210,
// 26/10/2026) : tolérée sur un mot d'au moins 5 lettres, seulement dans l'adresse, et
// seulement quand le numero ET le lieu sont cites (indicesNomAdresse).
const MOT_RUE_APPROCHE_MIN = 5;

function motDeRueCite(mot: string, mots: Set<string>, approche: boolean): boolean {
  if (mots.has(mot)) return true;
  if (!approche || mot.length < MOT_RUE_APPROCHE_MIN) return false;
  for (const m of mots) if (m.length >= MOT_RUE_APPROCHE_MIN && !/\d/.test(m) && uneLettreDEcart(mot, m)) return true;
  return false;
}

// Mots qui separent le type de voie de son nom (« rue DE LA Ferme »), et ceux qui separent le
// numero du type (« 12 BIS rue », « 6 ET 8 rue »).
const ARTICLES_VOIE = new Set(["de", "du", "des", "la", "le", "les", "l", "d"]);
const ENTRE_NUMERO_ET_VOIE = new Set(["bis", "ter", "et", "a", "au", "b", "t"]);
const MOTIF_NUMERO_DE_RUE = /^(\d{1,4})(?:bis|ter|b|t)?$/;

/**
 * Le texte cite-t-il « <numero de la copro> <type de voie> <mots de la rue> », dans cet ordre
 * (28/10/2026) ? Avant, un numero de la copro trouve N'IMPORTE OU dans le texte suffisait :
 * « CEDEX 9 », « le 28 octobre », « 25/10/2026 » faisaient d'une rue citee sans numero (« RUE
 * JEAN BONAL ») l'adresse d'une copro. Le numero doit preceder le type de voie (d'autres
 * numeros, « bis », « et » peuvent s'intercaler : « 41/43 rue », « 6 bis rue »), et les mots de la
 * rue suivre le type, apres un article eventuel. `approche` : un mot de rue a une lettre pres.
 */
function numeroDevantLaRue(jetons: string[], numeros: Set<string>, voie: { type: string; mots: string[] }, approche: boolean): boolean {
  for (let j = 0; j < jetons.length; j++) {
    if (jetons[j] !== voie.type) continue;
    let d = j + 1;
    while (d < jetons.length && ARTICLES_VOIE.has(jetons[d]!)) d++;
    const suite = new Set(jetons.slice(d, d + voie.mots.length + 2));
    if (!voie.mots.every((m) => motDeRueCite(m, suite, approche))) continue;
    for (let i = j - 1; i >= 0 && j - i <= 8; i--) {
      const t = jetons[i]!;
      const n = MOTIF_NUMERO_DE_RUE.exec(t);
      if (n) {
        if (numeros.has(String(Number(n[1])))) return true;
        continue;
      }
      if (!ENTRE_NUMERO_ET_VOIE.has(t)) break;
    }
  }
  return false;
}

function codePostalDe(adresse: string): string {
  return /\b(\d{5})\b/.exec(adresse)?.[1] ?? "";
}

// Noms Crypto colles ou abreges (« STMARTIN », « LEPLAZZA », « GALLIENI6 », « COEURJU »,
// « COLOMBIE66 ») : le mail ecrit « St Martin », « Le Plazza », « Galliéni 6 », « Coeur
// Julliand », « Colombier 66 ». Audit du journal du tri (19/10/2026) : ces copros n'etaient
// jamais reconnues par leur nom. On compare le nom compacte (sans espace ni ponctuation,
// « saint » = « st ») a une suite de mots CONSECUTIFS du mail, compactee elle aussi.
// Seuils (prototype du 19/10) : 6 caracteres dont 4 lettres d'affilee pour l'egalite, 7
// lettres pour un nom abrege ; en dessous (« PERI2 »), le risque de faux positif l'emporte.
const COMPACT_MIN = 6;
const ABREGE_MIN = 7;

function jetonsCompacts(texte: string): string[] {
  return normaliser(texte)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => (t === "saint" ? "st" : t === "sainte" ? "ste" : t));
}

/** Le nom compacte de la copro est-il ecrit, en plusieurs mots consecutifs, dans le texte ? */
function nomCompacteCite(nom: string, jetons: string[]): boolean {
  const cible = jetonsCompacts(nom).join("");
  if (cible.length < COMPACT_MIN || !/[a-z]{4}/.test(cible)) return false;
  // Un nom abrege (« COEURJU ») est fait de lettres seules : « LECLOS_E » ou « PERI56 » ne
  // sont pas des abreviations, « le clos est » ne doit pas trouver « LECLOS_E ».
  const abregeable = /^[a-z]+$/i.test(normaliser(nom).trim()) && cible.length >= ABREGE_MIN;
  // « COLOMBIE66 » : un radical abrege suivi du numero de rue.
  const [, radical, numero] = /^([a-z]+)(\d+)$/.exec(cible) ?? [];
  for (let i = 0; i < jetons.length; i++) {
    let acc = "";
    for (let j = i; j < jetons.length && acc.length < cible.length; j++) {
      const avant = acc.length;
      acc += jetons[j];
      if (j === i) continue;
      if (acc === cible) return true;
      // La coupure tombe dans un mot suivant le premier : « coeur julliand » commence par « coeurju ».
      if (abregeable && avant < cible.length && acc.startsWith(cible)) return true;
    }
    if (radical && numero && radical.length >= ABREGE_MIN) {
      const t = jetons[i]!;
      const voisinNumero = jetons[i + 1] === numero || jetons[i - 1] === numero;
      if (t.startsWith(radical) && t.length - radical.length <= 3 && voisinNumero) return true;
    }
  }
  return false;
}

// Mots d'un nom d'usage du registre qui ne se repetent pas forcement dans un mail : les
// articles, et le terme generique en tete (« Résidence les Tilleuls » -> « tilleuls »).
const ARTICLES = new Set(["les", "des", "aux", "sur", "sous"]);
const PREFIXES_GENERIQUES = new Set(["residence", "copropriete", "syndicat", "immeuble", "ensemble", "batiment", "batiments"]);

// Termes d'un nom de residence qui ne sont pas un type de voie (« Villa Médéric », « Clos
// Gallieni ») : avec eux, le mot de rue partage forme un nom a part entiere.
const TERMES_RESIDENCE = new Set(["villa", "clos", "parc", "jardin", "jardins", "hameau", "domaine"]);

/**
 * Un nom d'usage fait d'un terme de residence et d'un mot de rue partage par deux copros
 * (« VILLA MEDERIC », rue Médéric : S190 et S285 ; rejeu du 03/11/2026) : il compte quand il
 * est cite tel quel, mots a la suite. Jamais avec un numero (« SDC 12 Nordmann » et « SDC 8
 * NORDMANN » se confondraient) ni sans terme de residence.
 */
function nomUsageDeRueCite(nomUsage: string, noyauTexte: string): boolean {
  if (/\d/.test(nomUsage)) return false;
  const noyau = noyauDe(nomUsage);
  while (noyau.length > 1 && PREFIXES_GENERIQUES.has(noyau[0]!)) noyau.shift();
  if (noyau.length < 2 || !noyau.some((m) => TERMES_RESIDENCE.has(m))) return false;
  return noyauTexte.includes(` ${noyau.join(" ")} `);
}

/** Les mots d'un libelle sans articles ni lettres isolees (« LE CLOS MARTIN B-C et D » -> clos, martin). */
function noyauDe(s: string): string[] {
  return normaliser(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !ARTICLES.has(t) && !/^\d+$/.test(t));
}

/**
 * Le nom d'usage du registre est-il cite ? Memes garde-fous que le nom Crypto (mots de ville
 * retires, nom generique ignore), plus stricts sur un nom a UN seul mot distinctif : « Le Clos
 * Martin » exige « clos martin » a la suite, pas « Martin » seul (un patronyme). Un nom
 * d'usage qui porte un code postal (« REFERENCIEL 92500 … », saisie de remplissage) ou qui est
 * une adresse ne compte pas.
 */
function nomUsageCite(nomUsage: string, exclus: (m: string) => boolean, mots: Set<string>, noyauTexte: string): boolean {
  if (/\b\d{5}\b/.test(nomUsage) || nomEstAdresse(nomUsage)) return false;
  const distinctifs = motsSignificatifs(nomUsage).filter((m) => !exclus(m));
  if (distinctifs.length === 0) return nomUsageDeRueCite(nomUsage, noyauTexte);
  if (distinctifs.length >= 2) return distinctifs.every((m) => mots.has(m));
  const noyau = noyauDe(nomUsage);
  while (noyau.length > 1 && PREFIXES_GENERIQUES.has(noyau[0]!)) noyau.shift();
  if (noyau.length >= 2) return noyauTexte.includes(` ${noyau.join(" ")} `);
  return distinctifs[0]!.length >= 5 && mots.has(distinctifs[0]!);
}

/** Ce que la reconnaissance nom / adresse tolere, selon d'ou vient le texte. */
export interface OptionsNomAdresse {
  /**
   * Adresse a une lettre pres (faute de frappe dans un mot de rue). Oui par defaut ; jamais dans
   * une piece jointe (28/10/2026) : un PDF est long, un mot quelconque y trouve son voisin
   * (« fermer de 12h30 » lu « rue de la Ferme », mail de S220 range a tort en S277).
   * « avec-code-postal » (03/11/2026, PDF) : toleree seulement quand le code postal de la copro
   * est cite, en plus du numero devant la rue (« 6 RUE MARCEL SAMBAT 78800 », « 27 rue Jean
   * Bonnal 92250 ») ; le cas « fermer » reste ecarte (numero devant la rue exige depuis le 28/10).
   */
  approche?: boolean | "avec-code-postal";
  /**
   * Adresse citee sans code postal ni ville (28/10/2026) : acceptee quand le numero est colle a
   * la rue complete et que cette rue n'existe que dans une seule ville du referentiel. Non par
   * defaut : seulement le texte du mail (jamais dans un PDF ni « Immeuble concerné ») ; rangee
   * seule depuis le 03/11/2026 (origine « adresse-sans-lieu »). Elle ne compte que si rien
   * d'autre n'est trouve.
   */
  sansLieu?: boolean;
}

/**
 * Copros dont le NOM d'immeuble ou l'ADRESSE est cite dans le texte (objet + apercu). Indice
 * faible, a confirmer : les prestataires ecrivent « LE CYRANO » ou « 71 rue de Bezons »
 * plutot que le code. Deux garde-fous contre les faux positifs :
 *   - du nom, on retire les mots de ville (de tout le referentiel) et les mots de rue portes
 *     par au moins deux copros (28/10/2026) ; il faut >= 2 mots
 *     distinctifs presents, ou un seul d'au moins 5 lettres ; un nom qui est une adresse
 *     (« 12 RUE … ») ne compte pas comme nom ;
 *   - une adresse ne compte que si le type de voie et ses mots porteurs sont cites, ET que
 *     le code postal ou la ville de la copro apparait aussi (« 71 rue de Bezons » a
 *     Carrieres ne matche pas un mail de Bezons), ET l'un de ses numeros, juste devant le type
 *     de voie (numeroDevantLaRue, 28/10/2026). Une lettre d'ecart
 *     dans un mot de rue d'au moins 5 lettres est toleree (« SAMBAT » pour « Sembat ») quand
 *     le numero est cite, et seulement si aucune adresse n'est citee exactement. On rend au
 *     plus une raison par copro : les copros trouvees par le nom d'abord, puis par l'adresse.
 * L'appelant ne passe ici que l'objet et le DEBUT du corps : une adresse de copro dans la
 * signature du cabinet (son bureau) ne doit pas rattacher tous les mails (constat du 13/10).
 */
export function indicesNomAdresse(
  texte: string,
  copros: CoproTri[],
  options: OptionsNomAdresse = {},
): { reference: string; raison: string; approchee?: true; sansLieu?: true }[] {
  const approche = options.approche ?? true;
  const sansLieu = options.sansLieu ?? false;
  const sansLieuTrouves: { reference: string; raison: string; sansLieu: true }[] = [];
  const mots = new Set(normaliser(texte).split(/[^a-z0-9]+/).map(deplierVoie));
  const espace = ` ${normaliser(texte).replace(/[^a-z0-9]+/g, " ").trim()} `;
  const jetons = jetonsCompacts(texte);
  const jetonsVoie = normaliser(texte).split(/[^a-z0-9]+/).filter(Boolean).map(deplierVoie);
  const numerosCites = new Set(jetons.map((t) => /^(\d{1,4})(?:bis|ter|b|t)?$/.exec(t)?.[1]).filter((n): n is string => n !== undefined).map((n) => String(Number(n))));
  const villes = villesDu(copros);
  const rues = ruesPartagees(copros);
  const autreLieuCite = sansLieu && ([...mots].some((m) => /^\d{5}$/.test(m)) || [...villes].some((v) => mots.has(v)));
  const noyauTexte = ` ${noyauDe(texte).join(" ")} `;
  const parNom: { reference: string; raison: string }[] = [];
  const parAdresse: { reference: string; raison: string }[] = [];
  const approchees: { reference: string; raison: string; approchee: true }[] = [];
  const vues = new Set<string>();
  for (const c of copros) {
    const cle = cleDeReference(c.reference);
    if (!cle || vues.has(cle)) continue;
    const motsVille = new Set(motsSignificatifs(villeDe(c.adresse)));
    const exclus = (m: string) => motsVille.has(m) || villes.has(m) || rues.has(m);
    // Un nom ESTALE qui est une adresse (« 152 AVENUE GABRIEL PERI BEZONS ») n'est pas un nom
    // de residence : il passe par le controle d'adresse (lieu, numero), pas par le nom. Et un
    // nom de ville n'est distinctif pour aucune copro (audit du journal du tri, 19/10/2026).
    const distinctifs = nomEstAdresse(c.nom) ? [] : motsSignificatifs(c.nom).filter((m) => !exclus(m));
    const nomTrouve = (distinctifs.length >= 2
      ? distinctifs.every((m) => mots.has(m))
      : distinctifs.length === 1 && distinctifs[0]!.length >= 5 && mots.has(distinctifs[0]!))
      || nomCompacteCite(c.nom, jetons);
    // Sinon, un nom d'usage du registre national (« Le Clos Martin » pour LECLOS_BCD).
    const nomCite = nomTrouve ? c.nom : (c.nomsUsage ?? []).map(sansSuffixeRegistre).find((n) => n && nomUsageCite(n, exclus, mots, noyauTexte));
    if (nomCite) {
      const registre = nomCite !== c.nom ? " (nom au registre national)" : "";
      parNom.push({ reference: c.reference, raison: `Immeuble « ${nomCite} »${registre} cité dans le mail, à confirmer.` });
      vues.add(cle);
      continue;
    }
    // L'adresse de la copro, puis ses autres adresses au registre national (S269 : avenue de
    // Colmar dans Crypto, boulevard National au registre). Chacune avec son propre lieu.
    for (const adresse of [c.adresse, ...(c.adressesSecondaires ?? [])]) {
      const ville = villeDe(adresse);
      const cp = codePostalDe(adresse);
      const lieuPresent = (cp !== "" && mots.has(cp)) || (ville.length >= 4 && espace.includes(` ${ville} `));
      // Une rue compte si son type (rue, avenue…) ET tous ses mots porteurs sont cités, ET que
      // le lieu (code postal ou ville) l'est aussi : « 71 rue de Bezons » à Carrières ne matche
      // pas un mail de Bezons 95870.
      if (!lieuPresent) {
        // Sans lieu (28/10/2026, suggestion seulement) : le numero colle a la rue complete, et
        // une rue qu'une seule ville du referentiel connait (« 12 rue des Lilas » sans « Chatou »).
        // Jamais quand le texte cite un autre lieu (un code postal, une ville du referentiel) :
        // « 71 rue de Bezons 95870 BEZONS » n'est pas le 71 rue de Bezons de Carrieres.
        if (sansLieu && !autreLieuCite && !sansLieuTrouves.some((a) => a.reference === c.reference)) {
          const numeros = numerosDe(adresse);
          const v = numeros.size === 0 ? undefined : voiesDe(adresse).find((x) => mots.has(x.type) && x.mots.every((m) => mots.has(m)) && numeroDevantLaRue(jetonsVoie, numeros, x, false));
          if (v && villesDeLaRue(copros, v).size === 1) {
            sansLieuTrouves.push({ reference: c.reference, raison: `Adresse « ${v.type} ${v.mots.join(" ")} » citée sans ville ni code postal (une seule ville connue pour cette rue), à confirmer.`, sansLieu: true });
          }
        }
        continue;
      }
      // Le numero doit suivre (audit du 19/10/2026) : « 152 avenue Gabriel Péri » ne designe pas
      // la copro du 25 de la meme avenue. Une adresse sans numero en base ne se controle pas.
      const numeros = numerosDe(adresse);
      const numeroCite = [...numeros].some((n) => numerosCites.has(n));
      // Et il doit preceder la rue (28/10/2026) : « 6 rue Jean Bonal », pas « RUE JEAN BONAL …
      // depuis le 25/10/2026 ».
      const voie = voiesDe(adresse).find(
        (v) => mots.has(v.type) && v.mots.every((m) => mots.has(m)) && (numeros.size === 0 || numeroDevantLaRue(jetonsVoie, numeros, v, false)),
      );
      if (voie && (numeros.size === 0 || numeroCite)) {
        parAdresse.push({ reference: c.reference, raison: `Adresse « ${voie.type} ${voie.mots.join(" ")} » citée dans le mail, à confirmer.` });
        vues.add(cle);
        break;
      }
      // Une lettre d'ecart dans le nom de rue : seulement si le numero est cite (pas d'adresse
      // sans numero en base), en plus du lieu.
      const approcheIci = approche === true || (approche === "avec-code-postal" && cp !== "" && mots.has(cp));
      const approchee =
        approcheIci && numeroCite
          ? voiesDe(adresse).find((v) => mots.has(v.type) && v.mots.every((m) => motDeRueCite(m, mots, true)) && numeroDevantLaRue(jetonsVoie, numeros, v, true))
          : undefined;
      if (approchee && !approchees.some((a) => a.reference === c.reference)) {
        approchees.push({ reference: c.reference, raison: `Adresse proche de « ${approchee.type} ${approchee.mots.join(" ")} » citée dans le mail (une lettre d'écart), à confirmer.`, approchee: true });
      }
    }
  }
  // Le nom d'immeuble passe en premier, mais n'ecrase plus l'adresse (audit du 19/10/2026) :
  // un nom trouve a tort (un mot commun) masquait la bonne copro, citee par son adresse. Le
  // controle du numero suffit a ecarter les voisines de la meme rue. Une adresse a une lettre
  // pres ne compte que si aucune adresse n'est citee exactement : « 12 rue Pasteur » ne doit
  // pas aussi trouver la copro du 12 rue Pastour.
  const exactes = new Set([...parNom, ...parAdresse].map((i) => i.reference));
  const tolerees = parAdresse.length === 0 ? approchees.filter((a) => !exactes.has(a.reference)) : [];
  // Une adresse sans lieu ne compte que si rien d'autre n'est trouve : elle ne doit pas faire
  // d'une piste rangeable une piste « plusieurs ».
  const sansLieuSeules = exactes.size === 0 ? sansLieuTrouves.filter((a) => !tolerees.some((t) => t.reference === a.reference)) : [];
  return [...parNom, ...parAdresse, ...tolerees, ...sansLieuSeules];
}

/** Les lieux (code postal, a defaut ville) des copros du referentiel qui ont cette rue. */
function villesDeLaRue(copros: CoproTri[], voie: { mots: string[] }): Set<string> {
  const cle = voie.mots.join(" ");
  const lieux = new Set<string>();
  for (const c of copros) {
    for (const a of [c.adresse, ...(c.adressesSecondaires ?? [])]) {
      if (voiesDe(a).some((v) => v.mots.join(" ") === cle)) lieux.add(codePostalDe(a) || villeDe(a));
    }
  }
  return lieux;
}

// « Immeuble concerné : 86 rue E Vaillant - 89-91 rue M Berteaux-BEZONS » : pied des mails
// envoyés depuis Crypto par le cabinet, que le prestataire ou le copropriétaire cite en
// répondant. Audit du journal du tri (19/10/2026) : présent dans 36 des 122 mails de syndic4,
// presque toujours dans l'historique cité (9 fois au-delà des 4 000 caractères lus). On le cherche
// dans TOUT le corps. « Immeuble : » seul ne compte qu'en début de ligne (pas « l'immeuble »).
const LIGNE_IMMEUBLE = /(?:^[>\s]*Immeuble|Immeuble\s+concern\S*)\s*:\s*([^\n\u200b]{5,150})/gim;

/**
 * References des copros designees par une ligne « Immeuble concerné : … » du corps (historique
 * cite compris). L'adresse est lue par le moteur nom / adresse : la ville collee par Crypto
 * (« …Berteaux-BEZONS ») est d'abord detachee pour que le lieu soit reconnu.
 */
export function coprosImmeubleConcerne(texte: string, copros: CoproTri[]): string[] {
  const refs: string[] = [];
  for (const m of texte.matchAll(LIGNE_IMMEUBLE)) {
    const ligne = m[1]!.replace(/-(\p{Lu}[\p{Lu}' -]{2,})\s*$/u, " $1");
    for (const i of indicesNomAdresse(ligne, copros)) if (!refs.includes(i.reference)) refs.push(i.reference);
  }
  return refs;
}

// Le papier a en-tete du cabinet (son adresse, SIREN…) : a ignorer dans une piece jointe,
// sinon toute facture rattache le mail a la copro ou siege l'agence (place Michelet). Mesure
// du 13/10/2026 : sans ce filtre, 24 PDF sur 35 remontaient « place Michelet ».
// Audit du journal du tri (19/10/2026) :
//   - la signature des mails du cabinet (« REAL 31 … 3 Place Michelet / 78800 HOUILLES »)
//     faisait de meme dans le CORPS d'une reponse courte : meme filtre sur le corps ;
//   - on ne retire plus toute la LIGNE, seulement le morceau du cabinet : un devis sur deux
//     colonnes met l'adresse du chantier sur la meme ligne que celle du cabinet.
// Les mentions legales (SIREN, RCS…) sont retirees jusqu'a la fin de leur colonne (deux
// espaces, une tabulation ou la fin de ligne).
const ENTETE_CABINET = [
  /real\s*31/gi,
  // « 3 PL MICHELET » : bon de commande d'un fournisseur (28/10/2026, PDF rattache a tort a S158).
  /(?:\d{1,3}\s*,?\s*)?(?<![a-z])(?:place|pl\.?)\s+michelet(?:\s*,?\s*78800)?(?:\s*houilles)?/gi,
  /(?<![a-z])(?:siren|rcs|naf|carte\s+professionnelle|garantie\s+financi[eè]re).*?(?= {2,}|\x09|$)/gim,
  // La rue de l'agence de La Garenne-Colombes (03/11/2026) : « 13 rond point du souvenier
  // Français ». Sa ville, elle, reste : une copro de La Garenne n'a souvent qu'elle pour lieu
  // sur un PDF adresse « COPRO 9 A 11 RUE MEDERIC / REP PAR REAL 31 / 13 ROND POINT DU
  // SOUVENIR / FRANCAIS / 92250 LA GARENNE COLOMBES » (rejeu : retirer la ville en perdait 2).
  /(?:\d{1,3}\s*,?\s*)?(?<![a-z])rond[\s-]*point\s+du\s+souven\S*\s+fran\S*/gi,
];

/** Le texte sans les morceaux du papier a en-tete / de la signature du cabinet. */
export function retirerEnteteCabinet(texte: string): string {
  return ENTETE_CABINET.reduce((t, re) => t.replace(re, " "), texte);
}

/**
 * References de copro trouvees dans le texte d'une piece jointe (facture, bon d'intervention),
 * apres avoir retire le papier a en-tete du cabinet : d'abord les codes cites, puis
 * le nom d'immeuble / l'adresse du chantier (meme moteur que le mail, sans l'adresse a une
 * lettre pres : une seule copro trouvee dans les PDF range le mail sans clic). A l'ecran,
 * toujours a confirmer.
 */
export function coprosDansPdf(texte: string, copros: CoproTri[]): string[] {
  const utile = recollerLettres(retirerEnteteCabinet(texte));
  const parCle = new Map<string, CoproTri>();
  for (const c of copros) {
    const cle = cleDeReference(c.reference);
    if (cle) parCle.set(cle, c);
  }
  const refs: string[] = [...coprosParImmatriculation(utile, copros)];
  for (const cle of referencesCitees(utile)) {
    const c = parCle.get(cle);
    if (c && !refs.includes(c.reference)) refs.push(c.reference);
  }
  for (const i of indicesNomAdresse(utile, copros, { approche: "avec-code-postal" })) if (!refs.includes(i.reference)) refs.push(i.reference);
  // Les deux fiches d'une paire de copros jumelles : la principale, sauf si le PDF dit l'autre.
  const jumelle = choixJumelle(refs, utile);
  return jumelle ? [jumelle.reference] : refs;
}

// L'extraction pdfjs separe parfois une majuscule du reste du mot (« 51 A venue F och »,
// « l’ A igle », rejeu du 03/11/2026) : on la recolle quand au moins deux minuscules suivent.
const LETTRE_DETACHEE = /(?<![A-Za-zÀ-ÿ])([A-Z]) (?=[a-zà-ÿ]{2,})/g;

/** Le texte d'un PDF avec les majuscules detachees recollees a leur mot. */
export function recollerLettres(texte: string): string {
  return texte.replace(LETTRE_DETACHEE, "$1");
}

/**
 * Mail interne : envoyé depuis une adresse du cabinet (@real31.fr), hors la boîte partagée
 * elle-même. En pratique, un collègue a répondu à un client en laissant la boîte partagée en
 * copie ; le mail n'a plus d'utilité (avant on le gardait pour archiver sur Crypto). À corbeille.
 */
export function estMailInterne(deAdresse: string, boite: string): boolean {
  const de = deAdresse.trim().toLowerCase();
  // L'adresse technique d'Exchange (« MicrosoftExchange…@real31.fr ») envoie les avis de
  // non-remise : ce n'est pas un collegue (03/11/2026).
  return /@real31\.fr$/.test(de) && de !== boite.trim().toLowerCase() && !EXPEDITEUR_NON_REMIS.test(de);
}

/**
 * Pourquoi le tri propose la corbeille plutot qu'une copro. « publicite » : expediteur appris
 * du journal (expediteursPublicite). Plus d'avis de non-remise depuis le 03/11/2026 (ils vont
 * au binome : estAvisNonRemis).
 */
export type MotifCorbeille = "reponse-auto" | "publicite" | "publicite-probable";

// Publicite des le premier mail (etude du tri v2, R1c, 03/11/2026 : 24 justes sur 25) : un envoi
// de masse (domaine d'emailing, lien de desinscription) qui ne parle pas metier et n'a pas de PDF.
// Proposee seulement, comme toute corbeille. Plus large (tout « List-Unsubscribe »), la regle
// envoyait 19 a 47 factures et avis utiles a la corbeille : d'ou les deux garde-fous.
const DOMAINE_ENVOI_MASSE = /(?:brevosend|hubspotemail|sendibt|sendinblue|mailchimp|mcsv\.net|mailjet|sendgrid|mktomail|emarsys|aproxeml|newsletter|@news\.|@info\.|@notification\.|@notify\.|@communication\.|@marketing\.|@email\.|@e\.|@mail\.|@mails\.|@dm\.|@relationclient\.|actu)/i;
const LIEN_DESINSCRIPTION = /se d[ée]sinscrire|d[ée]sabonn|d[ée]sinscription|unsubscribe|ne (?:plus|pas) recevoir|si (?:ce|cet) (?:message|e-?mail|courriel) ne s.affiche pas|afficher dans (?:le|votre) navigateur|version en ligne/i;
const OBJET_METIER = /factur|avoir|relev|devis|sinistre|\bAG\b|assembl|r[èe]glement|commande|intervention|rapport|contrat|anomalie|alerte|rejet|quittance|[ée]ch[ée]ance|r[ée]clamation/i;

/**
 * Publicite probable des le premier mail : envoi de masse (domaine d'emailing, ou lien de
 * desinscription dans le corps), sans mot metier dans l'objet (facture, devis, AG, sinistre…),
 * sans PDF, d'un expediteur que ni ESTALE ni Crypto ne connait. Jamais un collegue.
 */
export function publiciteProbable(m: { deAdresse: string; objet: string; corps: string; aPdf: boolean; connu: boolean }): boolean {
  if (m.connu || m.aPdf || /@real31\.fr$/i.test(m.deAdresse.trim()) || OBJET_METIER.test(m.objet)) return false;
  return DOMAINE_ENVOI_MASSE.test(m.deAdresse) || LIEN_DESINSCRIPTION.test(m.corps);
}

// Objets des avis de non-remise et des reponses automatiques (Outlook en francais et en
// anglais, serveurs de messagerie). Ancres en tete : « RE: Non remis… » est une vraie reponse.
// Le texte est compare sans accents ; un prefixe entre crochets (« [EXTERNE] ») est toléré.
const DEBUT_OBJET = String.raw`^\s*(?:\[[^\]]*\]\s*)?`;
const OBJET_NON_REMIS = new RegExp(
  DEBUT_OBJET +
    String.raw`(?:non remis|message non remis|undeliverable|undelivered mail|delivery status notification|delivery (?:has )?failed|mail delivery (?:failed|failure|subsystem)|returned mail|echec de (?:la )?remise|notification d.etat de (?:la )?remise)`,
  "i",
);
const OBJET_REPONSE_AUTO = new RegExp(
  DEBUT_OBJET + String.raw`(?:reponse automatique|automatic reply|auto(?:matic)?[- ]?reply|autoreply|absence du bureau|absent du bureau|out of office)`,
  "i",
);
// Expediteurs des avis de non-remise : postmaster, MAILER-DAEMON, l'adresse technique
// d'Exchange Online (« MicrosoftExchange329e71ec…@… »).
const EXPEDITEUR_NON_REMIS = /^(?:postmaster|mailer-daemon|microsoftexchange[0-9a-f]*)@/i;

/** L'adresse technique d'un avis de non-remise (postmaster, MAILER-DAEMON, MicrosoftExchange…). */
export function estExpediteurNonRemis(deAdresse: string): boolean {
  return EXPEDITEUR_NON_REMIS.test(deAdresse.trim());
}

/**
 * Avis de non-remise d'un mail envoye, par son expediteur technique ou son objet (« Non
 * remis : … », « Undeliverable: … » ; pas « RE: Non remis… », une vraie reponse).
 */
export function estAvisNonRemis(m: { deAdresse: string; objet: string }): boolean {
  return estExpediteurNonRemis(m.deAdresse) || OBJET_NON_REMIS.test(normaliser(m.objet)) || estRecommandeAr24NonDelivre(m);
}

// Recommande electronique AR24 non delivre (decision Sekou du 03/11/2026) : « Votre courrier
// recommandé n'a pas été délivré », de notification@ar24.fr. Pas la facture AR24, ni l'alerte
// de connexion : seulement cet objet, de ce domaine.
const OBJET_AR24_NON_DELIVRE = /\bcourrier recommande n.a pas ete delivre\b/;

/** Avis AR24 d'un recommande electronique non delivre (objet et domaine ar24.fr). */
export function estRecommandeAr24NonDelivre(m: { deAdresse: string; objet: string }): boolean {
  return /@ar24\.fr$/i.test(m.deAdresse.trim()) && OBJET_AR24_NON_DELIVRE.test(normaliser(m.objet));
}

// L'adresse du destinataire d'un recommande AR24 non delivre : dans le corps (« l'adresse
// suivante a renvoyé une erreur à notre serveur : <adresse> ») et dans le nom du PDF
// (« Preuve de non distribution <adresse> 2026-01-20 14_29_05.pdf »).
const ADRESSE_AR24_CORPS = /adresse suivante[^:\n]*:\s*<?([^\s<>"]+@[^\s<>"]+?)>?(?=\s|$)/gi;
const ADRESSE_AR24_PDF = /^preuve de non[- ]distribution\s+([^\s]+@[^\s]+)\s/i;

/**
 * Les adresses e-mail des destinataires d'un recommande AR24 non delivre, en minuscules, sans
 * doublon : celles du corps puis celles des noms de PDF. Jamais une adresse d'AR24 ni du cabinet.
 */
export function adressesRecommandeAr24(corps: string, nomsPiecesJointes: readonly string[]): string[] {
  const vues: string[] = [];
  const ajouter = (a: string | undefined) => {
    const e = (a ?? "").trim().toLowerCase().replace(/[.,;]+$/, "");
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e) || /@(?:ar24\.fr|real31\.fr)$/.test(e) || vues.includes(e)) return;
    vues.push(e);
  };
  for (const m of nettoyerCorps(corps).matchAll(ADRESSE_AR24_CORPS)) ajouter(m[1]);
  for (const n of nomsPiecesJointes) ajouter(ADRESSE_AR24_PDF.exec(n.trim())?.[1]);
  return vues;
}

/** Qualites d'un client du cabinet : celles qu'un recommande AR24 peut viser. */
const QUALITES_CLIENT: ReadonlySet<QualiteExpediteur> = new Set(["copropriétaire", "conseil syndical", "locataire", "mandataire"]);

/** Debut de la raison affichee pour un recommande AR24 non delivre (suggererCoproAr24). */
export const RAISON_AR24 = "Recommandé AR24 non délivré : un copropriétaire a une adresse e-mail fausse, à rappeler.";

/**
 * La piste d'un recommande AR24 non delivre (decision Sekou du 03/11/2026) : l'adresse du
 * destinataire (adressesRecommandeAr24) cherchee dans l'index des expediteurs, qualites de
 * client seulement (coproprietaire, conseil syndical, locataire, mandataire ; jamais un
 * fournisseur ni un notaire). Rien d'autre : le reste du corps est le gabarit d'AR24, et la
 * partie locale d'une adresse (« prenom.nom@ ») designait a tort un nom d'immeuble (rejeu du
 * 03/11/2026). Une copro : piste « sure », rangee au binome comme un autre mail ; plusieurs ou
 * aucune : file manuelle. La raison commence toujours par RAISON_AR24.
 */
export function suggererCoproAr24(adresses: readonly string[], ref: ReferentielTri): Suggestion {
  const liens = adresses.flatMap((a) => (ref.expediteurs[a] ?? []).filter((l) => QUALITES_CLIENT.has(l.qualite)));
  const mention = (s: Suggestion): Suggestion => ({ ...s, raison: `${RAISON_AR24} ${s.raison}` });
  if (liens.length === 0) {
    return mention({
      nature: "aucune",
      candidats: [],
      raison: adresses.length ? "Adresse du destinataire inconnue dans ESTALE et dans Crypto." : "Adresse du destinataire introuvable dans l'avis.",
    });
  }
  // Le moteur ordinaire sur la seule adresse du destinataire : memes regles qu'un expediteur
  // connu (copro inactive effacee devant une active, plafonnee a « faible », jumelles).
  const cle = adresses[0]!;
  const s = suggererCopro({ deAdresse: cle, objet: "", apercu: "" }, { ...ref, expediteurs: { [cle]: liens } });
  return mention({ ...s, raison: s.raison.replace(/^Adresse connue/, "Adresse du destinataire connue") });
}

/**
 * L'objet du mail d'origine, cite par l'avis de non-remise : « Non remis : Convocation AG
 * S0297 » -> « Convocation AG S0297 ». Il porte souvent le code de la copro ou son adresse.
 * Objet sans « : » apres l'en-tete (« Delivery Status Notification (Failure) ») : vide.
 * Un objet qui n'est pas celui d'un avis de non-remise est rendu tel quel.
 */
export function objetSansNonRemis(objet: string): string {
  if (!OBJET_NON_REMIS.test(normaliser(objet))) return objet;
  const i = objet.indexOf(":");
  return i >= 0 ? objet.slice(i + 1).trim() : "";
}

/**
 * Reponse automatique ou publicite apprise : le tri propose la corbeille au lieu d'une copro
 * (decision Sekou du 19/10/2026). Ce n'est qu'une proposition : rien n'est supprime sans clic.
 * Avis de non-remise (decision Sekou du 03/11/2026, remplace celle du 19/10) : JAMAIS de
 * corbeille, ni comme publicite apprise ; il part au binome de la copro (estAvisNonRemis).
 */
export function motifCorbeille(
  m: { deAdresse: string; objet: string },
  /** Expediteurs appris du journal (expediteursPublicite), en minuscules. */
  publicites?: ReadonlySet<string>,
): MotifCorbeille | null {
  if (estAvisNonRemis(m)) return null;
  if (OBJET_REPONSE_AUTO.test(normaliser(m.objet))) return "reponse-auto";
  if (publicites?.has(cleExpediteur(m.deAdresse))) return "publicite";
  return null;
}

/** La suggestion d'un mail a mettre a la corbeille : aucune copro, la raison le dit. */
export function suggestionCorbeille(motif: MotifCorbeille): Suggestion {
  return {
    nature: "aucune",
    candidats: [],
    raison:
      motif === "reponse-auto"
        ? "Réponse automatique (absence, accusé de réception) : proposée à la corbeille."
        : motif === "publicite-probable"
          ? "Envoi de masse sans facture ni objet métier, d'un expéditeur inconnu : publicité probable, proposée à la corbeille."
          : "Expéditeur déjà mis à la corbeille au moins deux fois, jamais rangé : proposé à la corbeille.",
  };
}

/** Debut de la raison affichee pour un avis de non-remise (avecMentionNonRemis). */
export const RAISON_NON_REMIS = "Avis de non-remise : un copropriétaire a une adresse mail fausse, à rappeler.";

/**
 * La piste d'un avis de non-remise (decision Sekou du 03/11/2026) : le moteur ordinaire
 * (suggererCopro), mais sur l'objet du mail d'origine (objetSansNonRemis) et SANS
 * l'expediteur technique (postmaster… n'est l'indice de rien). Le corps, qui cite le mail
 * d'origine (« Immeuble concerné », code, adresse), compte comme pour un autre mail. La
 * conversation (avecMemeConversation) s'applique ensuite, comme pour tout mail, puis
 * avecMentionNonRemis.
 */
export function suggererCoproNonRemis(
  mail: Pick<MailATrier, "objet" | "apercu"> & { corps?: string },
  ref: ReferentielTri,
): Suggestion {
  return suggererCopro({ ...mail, deAdresse: "", objet: objetSansNonRemis(mail.objet) }, ref);
}

/** La raison d'un avis de non-remise commence par RAISON_NON_REMIS : l'equipe sait qui rappeler. */
export function avecMentionNonRemis(s: Suggestion): Suggestion {
  return { ...s, raison: `${RAISON_NON_REMIS} ${s.raison}` };
}

// Formulaires de l'extranet Crypto (decision Sekou du 03/11/2026) : no-reply@crypto-extranet.com
// relaie la demande d'un client ; son adresse est la ligne « Email: » du corps.
const EMAIL_FORMULAIRE = /^[ \t]*E-?mail[ \t]*:[ \t]*<?([^\s<>"]+@[^\s<>"]+?)>?(?=[\s<]|$)/im;
const OBJET_CHANGEMENT_INFORMATION = /\bchangement d.informations?\b/;

/** Mail relaye par l'extranet Crypto (formulaire rempli par un client). */
export function estFormulaireExtranet(deAdresse: string): boolean {
  return /@crypto-extranet\.com$/i.test(deAdresse.trim());
}

/** L'adresse e-mail du client qui a rempli le formulaire (ligne « Email: »), en minuscules ; null sinon. */
export function expediteurDuFormulaire(corps: string): string | null {
  const e = (EMAIL_FORMULAIRE.exec(corps)?.[1] ?? "").toLowerCase().replace(/[.,;]+$/, "");
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e) && !/@(?:real31\.fr|crypto-extranet\.com)$/.test(e) ? e : null;
}

/**
 * La piste d'un formulaire de l'extranet (decision Sekou du 03/11/2026) : le moteur ordinaire,
 * avec l'adresse e-mail du client (expediteurDuFormulaire) pour expediteur, en plus des autres
 * indices du corps. L'expediteur passe avant une adresse postale (suggererCopro) : pour une
 * « Demande de changement d'information », l'adresse citee est souvent le NOUVEAU domicile du
 * client, pas sa copro, elle ne l'emporte jamais sur l'e-mail ; seule, elle ne bascule rien
 * (pisteAutreAgenceStricte exige le nom ET l'adresse).
 *   - L'e-mail et le corps designent la meme copro, seule : la piste du corps, en « sure »
 *     (elle garde son origine, donc la bascule stricte d'un nom et d'une adresse complete).
 *   - Client de plusieurs copros : celle que le corps designe seule par une piste rangeable,
 *     si elle en fait partie (deux indices d'accord) ; jamais pour un changement d'information.
 */
export function suggererCoproFormulaire(
  mail: Pick<MailATrier, "deAdresse" | "objet" | "apercu"> & { corps?: string },
  ref: ReferentielTri,
): Suggestion {
  const ordinaire = suggererCoproFormulaireOrdinaire(mail, ref);
  const texte = mail.corps ?? mail.apercu;
  const parCode = coproParCodeCrypto(texte, ref, expediteurDuFormulaire(texte));
  if (!parCode) return ordinaire;
  // Un identifiant explicite (code dans l'objet, immatriculation) sur une AUTRE copro reste le plus fort.
  if (ordinaire.identifiant && ordinaire.candidats.length === 1 && ordinaire.candidats[0] !== parCode.copro.reference) return ordinaire;
  return {
    nature: "sure",
    candidats: [parCode.copro.reference],
    raison: `Code Crypto « ${parCode.code} » du formulaire : ${parCode.copro.reference}.`,
    identifiant: true,
  };
}

// Le code Crypto de la copro dans le corps d'un formulaire de l'extranet (decision Sekou du
// 04/11/2026, REA-495) : « Expéditeur: NOM Prénom (qualité - CODE[/lot]) », a defaut le champ
// « Lot: CODE/lot ». La qualite est coproprietaire, proprietaire ou locataire.
const LIGNE_EXPEDITEUR_CODE = /^[ \t]*Exp\S*[ \t]*:[^\n]*?\(\s*(?:copropri[ée]taire|propri[ée]taire|locataire)\s+-\s+([^)\n]+)\)/im;
const LIGNE_LOT = /^[ \t]*Lot[ \t]*:[ \t]*([^\n]+)$/im;

/**
 * Les formes sous lesquelles lire le code du formulaire, de la plus longue a la plus courte :
 * la chaine entiere (un nom Crypto peut contenir « / » : PARIS52/54, BRUNET6/8), puis sans le
 * dernier segment « /… » (le lot). Jamais une coupe au premier « / ». Vide si aucun code.
 */
export function codesCryptoDuFormulaire(corps: string): string[] {
  const brut = (LIGNE_EXPEDITEUR_CODE.exec(corps)?.[1] ?? LIGNE_LOT.exec(corps)?.[1] ?? "").replace(/\r/g, "").trim();
  if (!brut) return [];
  const segments = brut.split("/");
  const essais = [brut, segments.slice(0, -1).join("/").trim()].filter(Boolean);
  return [...new Set(essais)];
}

/**
 * La copro que le code du formulaire designe EXACTEMENT (nom Crypto, casse et espaces de bord
 * ignores, jamais approche : FOCH13 et FOCH1-3 sont deux copros). Une seule copro, active
 * (une inactive : pas de decision), et que l'adresse e-mail du client ne contredit pas : un
 * client connu de ce referentiel SEULEMENT sur d'autres copros ne decide rien. Null sinon.
 */
export function coproParCodeCrypto(
  corps: string,
  ref: ReferentielTri,
  clientEmail: string | null,
): { copro: CoproTri; code: string } | null {
  const cle = (t: string) => t.trim().toUpperCase();
  for (const code of codesCryptoDuFormulaire(corps)) {
    const trouvees = ref.copros.filter((c) => c.nom.trim() !== "" && cle(c.nom) === cle(code));
    if (trouvees.length === 0) continue;
    const copro = trouvees[0]!;
    if (trouvees.length > 1 || copro.inactive) return null;
    const liens = (clientEmail ? ref.expediteurs[clientEmail] ?? [] : []).filter((l) => QUALITES_CLIENT.has(l.qualite));
    const cleCopro = cleDeReference(copro.reference);
    if (liens.length > 0 && !liens.some((l) => cleDeReference(l.reference) === cleCopro)) return null;
    return { copro, code };
  }
  return null;
}

function suggererCoproFormulaireOrdinaire(
  mail: Pick<MailATrier, "deAdresse" | "objet" | "apercu"> & { corps?: string },
  ref: ReferentielTri,
): Suggestion {
  const client = expediteurDuFormulaire(mail.corps ?? mail.apercu);
  const parCorps = suggererCopro(mail, ref);
  if (!client) return parCorps;
  const s = suggererCopro({ ...mail, deAdresse: client }, ref);
  const seule = parCorps.candidats.length === 1 && pisteRangeable(parCorps) ? parCorps.candidats[0]! : null;
  if (!seule || !s.candidats.includes(seule)) return s;
  const corps = parCorps.raison.replace(/,? à confirmer\.?$/, "").replace(/\.$/, "");
  if (s.nature === "sure" && s.candidats.length === 1) return { ...parCorps, nature: "sure", raison: `${s.raison} ${corps}.` };
  if (s.nature === "plusieurs" && !OBJET_CHANGEMENT_INFORMATION.test(normaliser(mail.objet))) {
    return { nature: "sure", candidats: [seule], raison: `${s.raison.replace(/\.$/, "")} ; le formulaire désigne ${seule} (${corps}).` };
  }
  return s;
}

/** Cle du dossier « corbeille » dans le journal (supprimerMail). */
export const DOSSIER_CORBEILLE = "corbeille";

/** Un expediteur passe en « publicite » apres tant de mises a la corbeille. */
export const CORBEILLES_PUBLICITE = 2;

/** Adresse d'expediteur comparable : sans espaces, en minuscules (Graph ne garde pas la casse d'un mail a l'autre). */
export function cleExpediteur(adresse: string): string {
  return adresse.trim().toLowerCase();
}

/**
 * Expediteurs dont les mails sont proposes a la corbeille comme publicite (decision Sekou du
 * 26/10/2026), appris du journal du tri : mis a la corbeille au moins CORBEILLES_PUBLICITE fois
 * et JAMAIS ranges dans une copro ni un dossier de binome (Comptabilité et Divers ne comptent
 * pas). Une proposition, jamais une suppression automatique.
 *   - Jamais un expediteur d'avis de non-remise (postmaster, MAILER-DAEMON, MicrosoftExchange…),
 *     et un avis de non-remise mis a la corbeille ne compte pour personne : jusqu'au
 *     03/11/2026 la corbeille leur etait proposee, le journal en garde.
 *   - Par ADRESSE exacte, pas par domaine : mesure du 26/10 sur syndic4, les 5 expediteurs
 *     publicitaires ont chacun une adresse fixe (newsletter@…, marketing@…), alors qu'un
 *     domaine regroupe souvent un prestataire (veolia.com : 3 adresses, dont des factures).
 *   - Une corbeille d'avis de non-remise ou de reponse automatique ne compte pas : un
 *     coproprietaire absent deux fois n'est pas une publicite.
 *   - Jamais une adresse du cabinet (@real31.fr : deja « interne »), ni une adresse connue
 *     d'une copro dans ESTALE ou Crypto (`connus` : coproprietaire, fournisseur…).
 * Les lignes annulees ne doivent pas etre passees.
 */
export function expediteursPublicite(
  historique: Pick<EntreeJournalTri, "expediteur" | "objet" | "dossierCle" | "coproReference" | "copros">[],
  connus: Readonly<Record<string, unknown>> = {},
): Set<string> {
  const compte = new Map<string, { corbeille: number; range: boolean }>();
  for (const e of historique) {
    const cle = cleExpediteur(e.expediteur);
    if (!cle || /@real31\.fr$/.test(cle) || estExpediteurNonRemis(cle)) continue;
    const c = compte.get(cle) ?? { corbeille: 0, range: false };
    if (e.coproReference || e.copros.length > 0 || e.dossierCle?.startsWith("binome:")) c.range = true;
    else if (e.dossierCle === DOSSIER_CORBEILLE && !estAvisNonRemis({ deAdresse: e.expediteur, objet: e.objet }) && !motifCorbeille({ deAdresse: e.expediteur, objet: e.objet })) {
      c.corbeille++;
    }
    compte.set(cle, c);
  }
  const out = new Set<string>();
  for (const [cle, c] of compte) if (c.corbeille >= CORBEILLES_PUBLICITE && !c.range && !(cle in connus)) out.add(cle);
  return out;
}

const LIBELLE_QUALITE: Record<QualiteExpediteur, string> = {
  "copropriétaire": "copropriétaire",
  "conseil syndical": "membre du conseil syndical",
  locataire: "locataire",
  mandataire: "mandataire d'un copropriétaire",
  notaire: "notaire d'une vente en cours",
  fournisseur: "fournisseur",
};

/**
 * Propose une copropriete ESTALE pour un mail. Ordre des indices, du plus fort au plus
 * faible : code cite dans l'objet, adresse de l'expediteur connue d'ESTALE, code cite
 * dans le corps. Rien n'est jamais applique sans le clic d'un collaborateur.
 * Une copro INACTIVE n'est jamais une piste sure (plafonnerInactives).
 */
export function suggererCopro(
  mail: Pick<MailATrier, "deAdresse" | "objet" | "apercu"> & {
    /** Le corps entier, historique cite compris, pour « Immeuble concerné » ; a defaut, l'apercu. */
    corps?: string;
  },
  ref: ReferentielTri,
): Suggestion {
  const brute = departagerJumelles(suggestionBrute(mail, ref), `${mail.objet}\n${mail.corps ?? mail.apercu}`);
  // Les variantes d'ecriture ne servent qu'a un mail sans aucune piste : depliees partout, elles
  // cassaient une piste juste (« SDC 21 REPUBLIQUE », nom Crypto REPUBLIQ21, lu « 21 boulevard
  // REPUBLIQUE », rejeu du 03/11/2026).
  if (brute.nature !== "aucune") return plafonnerInactives(brute, ref);
  const v = (t: string) => variantesEcriture(t, ref.copros);
  const lu = { ...mail, objet: v(mail.objet), apercu: v(mail.apercu), ...(mail.corps !== undefined ? { corps: v(mail.corps) } : {}) };
  if (lu.objet === mail.objet && lu.apercu === mail.apercu && lu.corps === mail.corps) return plafonnerInactives(brute, ref);
  return plafonnerInactives(suggestionBrute(lu, ref), ref);
}

// Variantes d'ecriture courantes dans les mails (etude du tri v2, 03/11/2026, 7 justes sur 7) :
//   - « LGC » pour La Garenne-Colombes (« Chauffage 57 rue mederic LGC »), et « Garennes » ;
//   - un code colle a la suite (« Vos Réf : OR/4439079 - S128FUIT ») ;
//   - une rue sans son type (« 5 MURGERS », « 51 Foch », « 9 Mederic »), quand le mot est la
//     rue d'une copro du referentiel, sous un seul type de voie.
const VILLE_ABREGEE = /\bLGC\b/gi;
const GARENNES = /\bgarennes\b/gi;
const CODE_COLLE = /\b(SE|S)(\d{3,4})(?=[A-Za-z])/g;
const MOIS = new Set(["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"]);
const NUMERO_PUIS_MOT = /\b(\d{1,4}(?:\s?(?:bis|ter))?)\s+((?:de la |de l'|des |du |de |d')?)([A-Za-zÀ-ÿ'-]{4,})/gi;

// Mot de rue (dernier mot porteur de la voie) -> son type, quand le referentiel ne lui en
// connait qu'un. Memoise par referentiel.
const cacheTypesDeRue = new WeakMap<CoproTri[], Map<string, string>>();

function typesDeRue(copros: CoproTri[]): Map<string, string> {
  const deja = cacheTypesDeRue.get(copros);
  if (deja) return deja;
  const types = new Map<string, Set<string>>();
  for (const c of copros) {
    for (const a of [c.adresse, ...(c.adressesSecondaires ?? [])]) {
      for (const v of voiesDe(a)) {
        const mot = v.mots[v.mots.length - 1]!;
        (types.get(mot) ?? types.set(mot, new Set()).get(mot)!).add(v.type);
      }
    }
  }
  const uniques = new Map([...types].filter(([, t]) => t.size === 1).map(([m, t]) => [m, [...t][0]!]));
  cacheTypesDeRue.set(copros, uniques);
  return uniques;
}

/** Le texte avec les variantes d'ecriture courantes depliees (ville abregee, code colle, rue sans type). */
export function variantesEcriture(texte: string, copros: CoproTri[]): string {
  if (!texte) return texte;
  const types = typesDeRue(copros);
  return texte
    .replace(VILLE_ABREGEE, "La Garenne-Colombes")
    .replace(GARENNES, "Garenne")
    .replace(CODE_COLLE, "$1$2 ")
    .replace(NUMERO_PUIS_MOT, (tout, numero: string, article: string, mot: string) => {
      const m = normaliser(mot);
      const type = types.get(m);
      // « l'AG du 11 septembre » n'est pas la rue du 11 Septembre (rejeu du 03/11/2026).
      return type && !TYPES_VOIE.includes(m) && !MOIS.has(m) ? `${numero} ${type} ${article}${mot}` : tout;
    });
}

/**
 * Copros inactives (mandat termine) : au plus une piste faible, et apres les copros actives.
 * Elles restent reconnues : l'ancien syndic, un coproprietaire ou un locataire ecrit encore
 * (coordonnees du nouveau syndic a transmettre), et une copro peut etre marquee inactive a
 * tort. Citee par son code dans l'objet ou son immatriculation, elle garde la marque
 * `identifiant` : seule piste qui la range sans clic (28/10/2026).
 */
function plafonnerInactives(s: Suggestion, ref: ReferentielTri): Suggestion {
  const inactives = new Set(ref.copros.filter((c) => c.inactive).map((c) => c.reference));
  if (!s.candidats.some((r) => inactives.has(r))) return s;
  const candidats = [...s.candidats.filter((r) => !inactives.has(r)), ...s.candidats.filter((r) => inactives.has(r))];
  if (s.nature === "sure") {
    return s.identifiant
      ? { nature: "faible", candidats, raison: `${s.raison} Copropriété inactive (mandat terminé).`, identifiant: true }
      : { nature: "faible", candidats, raison: `${s.raison} Copropriété inactive : à confirmer.` };
  }
  return { ...s, candidats };
}

function suggestionBrute(
  mail: Pick<MailATrier, "deAdresse" | "objet" | "apercu"> & { corps?: string },
  ref: ReferentielTri,
): Suggestion {
  const parCle = new Map<string, CoproTri>();
  for (const c of ref.copros) {
    const cle = cleDeReference(c.reference);
    if (cle) parCle.set(cle, c);
  }
  // Sans liens colles ni signature du cabinet (audit du journal du tri, 19/10/2026).
  const preparer = (t: string) => retirerEnteteCabinet(nettoyerCorps(t));
  const corps = preparer(mail.apercu);

  // 0. Numero d'immatriculation RNC cite (objet ou corps) : identifiant unique -> indice sur.
  // Les notifications de l'ANAH ne portent que ca (ni code, ni expediteur connu).
  const immats = coprosParImmatriculation(`${mail.objet}\n${corps}`, ref.copros);
  if (immats.length === 1) {
    return { nature: "sure", candidats: immats, raison: `Numéro d'immatriculation de ${immats[0]} cité.`, identifiant: true };
  }
  if (immats.length > 1) {
    return { nature: "plusieurs", candidats: immats, raison: "Plusieurs numéros d'immatriculation cités." };
  }

  // « Immeuble concerné : … » cite dans l'echange (audit du journal du tri, 19/10/2026).
  const immeuble = coprosImmeubleConcerne(mail.corps === undefined ? corps : preparer(mail.corps), ref.copros);

  // 1. Code dans l'objet (le plus fiable : c'est souvent une reponse a nos propres mails).
  const dansObjet = referencesCitees(mail.objet);
  const objetEstale = dansObjet.map((k) => parCle.get(k)).filter((c): c is CoproTri => Boolean(c));
  if (objetEstale.length === 1) {
    const c = objetEstale[0]!;
    // Le pied « Immeuble concerné » designe une autre copro : on ne tranche pas (objet
    // recopie d'un autre fil, « Re: S302 · … - Colombier 66 »).
    const autres = immeuble.filter((r) => r !== c.reference);
    if (immeuble.length > 0 && !immeuble.includes(c.reference)) {
      return {
        nature: "plusieurs",
        candidats: [c.reference, ...autres],
        raison: `Code ${c.reference} cité dans l'objet, mais « Immeuble concerné » désigne ${autres.join(", ")} : à départager.`,
      };
    }
    return { nature: "sure", candidats: [c.reference], raison: `Code ${c.reference} cité dans l'objet.`, identifiant: true };
  }
  if (objetEstale.length > 1) {
    return {
      nature: "plusieurs",
      candidats: objetEstale.map((c) => c.reference),
      raison: "Plusieurs codes de copropriété cités dans l'objet.",
    };
  }

  // 1 bis. « Immeuble concerné : … » : le pied d'un mail du cabinet, cite dans la reponse.
  // Il passe avant l'expediteur : un copropriétaire de plusieurs copros, ou un prestataire,
  // ecrit au sujet de l'immeuble que notre propre mail designait.
  if (immeuble.length === 1) {
    return { nature: "sure", candidats: immeuble, raison: `« Immeuble concerné » cité dans l'échange : ${immeuble[0]}.` };
  }
  if (immeuble.length > 1) {
    return { nature: "plusieurs", candidats: immeuble, raison: "Plusieurs « Immeuble concerné » cités dans l'échange." };
  }

  // 2. Expediteur connu d'ESTALE ou de l'annuaire Crypto. Un FOURNISSEUR ne compte pas ici :
  // un prestataire ecrit pour toutes les copros ou il intervient, alors qu'ESTALE ou Crypto
  // ne le rattache souvent qu'a une seule (audit du journal du tri, 19/10/2026).
  // S'il n'est connu que comme fournisseur, il ne sert qu'en dernier recours (etape 5).
  // Une adresse connue d'une copro active ET d'une copro inactive (ancien immeuble d'un
  // coproprietaire) : l'inactive s'efface devant un lien de meme force sur une active.
  const tousLiens = ref.expediteurs[mail.deAdresse.trim().toLowerCase()] ?? [];
  const actifs = tousLiens.filter((l) => !parCle.get(cleDeReference(l.reference) ?? "")?.inactive);
  const estFort = (l: LienExpediteur) => l.qualite !== "fournisseur";
  const liens = actifs.some(estFort) || (!tousLiens.some(estFort) && actifs.length > 0) ? actifs : tousLiens;
  const forts = liens.filter((l) => l.qualite !== "fournisseur");
  const ou = (ls: LienExpediteur[]) => [...new Set(ls.map((l) => (l.source === "crypto" ? "Crypto" : "ESTALE")))].join(" et ");
  const references = [...new Set([...forts, ...liens].map((l) => l.reference))];
  if (forts.length > 0 && references.length === 1) {
    const qualite = LIBELLE_QUALITE[forts[0]!.qualite];
    return {
      nature: "sure",
      candidats: references,
      raison: `Adresse connue dans ${ou(forts)} : ${qualite} de ${references[0]}.`,
    };
  }
  if (forts.length > 0) {
    const qualites = [...new Set(liens.map((l) => LIBELLE_QUALITE[l.qualite]))].join(", ");
    return {
      nature: "plusieurs",
      candidats: references,
      raison: `Adresse connue dans ${ou(liens)} sur ${references.length} copropriétés (${qualites}).`,
    };
  }

  // 3. Code dans le corps : indice faible (une signature, un historique cite...).
  const dansCorps = referencesCitees(corps);
  const corpsEstale = dansCorps.map((k) => parCle.get(k)).filter((c): c is CoproTri => Boolean(c));
  if (corpsEstale.length > 0) {
    const refs = corpsEstale.map((c) => c.reference);
    return {
      nature: refs.length === 1 ? "faible" : "plusieurs",
      candidats: refs,
      raison: refs.length === 1 ? `Code ${refs[0]} cité dans le message.` : "Plusieurs codes cités dans le message.",
      ...(refs.length === 1 ? { origine: "code-corps" as const } : {}),
    };
  }

  // 4. Nom de l'immeuble ou adresse cite (prestataires : « LE CYRANO », « 71 rue de Bezons »).
  // Indice faible, mais sur UNE copro il est range sans clic quand l'automatique est ouvert (origine
  // « nom-adresse », decision du 26/10/2026 ; plusieurs copros : a choisir). On ne lit que
  // l'objet et le DEBUT du corps : l'adresse du cabinet, en signature de bas de mail, ne
  // doit pas rattacher tous les mails (constat du 13/10/2026).
  const indices = indicesNomAdresse(`${mail.objet}\n${corps.slice(0, TETE_CORPS)}`, ref.copros, { sansLieu: true });
  if (indices.length === 1) {
    // Un code hors perimetre cite a cote (« S0142 », copro d'une autre agence) : la piste reste
    // a confirmer, elle ne porte pas l'origine qui la rend rangeable sans clic.
    const codeHorsPerimetre = new RegExp(MOTIF_REFERENCE.source, "i").test(`${mail.objet}\n${corps}`);
    // Une adresse a une lettre pres reste aussi a confirmer (decision Sekou du 27/10/2026) :
    // elle n'etait pas dans la mesure des 15 faibles justes, on l'observe d'abord. Une adresse
    // sans ville ni code postal etait une suggestion seulement (28/10/2026), rangeable depuis le 03/11.
    return {
      nature: "faible",
      candidats: [indices[0]!.reference],
      raison: indices[0]!.raison,
      // Sans ville ni code postal (03/11/2026) : rangeable aussi, mais sous son origine propre
      // (« adresse-sans-lieu ») pour la mesurer a part.
      ...(codeHorsPerimetre || indices[0]!.approchee ? {} : { origine: indices[0]!.sansLieu ? ("adresse-sans-lieu" as const) : ("nom-adresse" as const) }),
    };
  }
  if (indices.length > 1) {
    return { nature: "plusieurs", candidats: indices.map((i) => i.reference), raison: "Plusieurs copropriétés citées par leur nom ou adresse, à confirmer." };
  }

  // 5. Expediteur connu seulement comme fournisseur : au plus un indice faible.
  if (references.length > 0) {
    return {
      nature: references.length === 1 ? "faible" : "plusieurs",
      candidats: references,
      raison:
        references.length === 1
          ? `Fournisseur connu dans ${ou(liens)} de ${references[0]}, à confirmer.`
          : `Fournisseur connu dans ${ou(liens)} sur ${references.length} copropriétés, à confirmer.`,
    };
  }

  // Un code est cite mais aucune copro du perimetre ne le porte : hors perimetre. On affiche
  // le code tel qu'il est ecrit dans le mail ("S0142"), pas sa cle de comparaison.
  const premier = new RegExp(MOTIF_REFERENCE.source, "i").exec(`${mail.objet}
${corps}`);
  if (premier) {
    return {
      nature: "hors-estale",
      candidats: [],
      raison: `Code ${premier[0].toUpperCase()} cité, mais cette copropriété n'est pas dans le périmètre de la boîte.`,
    };
  }

  return { nature: "aucune", candidats: [], raison: "Adresse inconnue dans ESTALE et dans Crypto, et aucun code de copropriété dans le mail." };
}

// Reference de dossier du cabinet citee dans un echange : « Réf : RG/4431363 », « SC/4218461 »
// (initiales du gestionnaire, barre, numero). Sensible a la casse : des initiales en capitales.
const MOTIF_REF_DOSSIER = /\b([A-Z]{2,3})\/\d{6,8}\b/g;

/**
 * Departage par le gestionnaire (decision Sekou du 28/10/2026) : quand plusieurs copros sont
 * proposees, celles du gestionnaire que le mail designe passent EN TETE de la liste. Il est
 * designe par :
 *   - une reference de dossier « SC/4218461 » dont les initiales sont les siennes (initiales
 *     de l'intranet, uniques) ;
 *   - sa signature dans l'historique cite, « Prénom NOM <…@real31.fr> » (« Le 22 octobre…,
 *     Romain GOBERT <syndic4@real31.fr> a écrit »), nom complet d'au moins deux mots.
 * Un seul gestionnaire designe parmi ceux des candidates, sinon rien ne change. Prudence
 * decidee : la nature et l'ensemble des candidates ne changent pas, seul l'ordre. Ce depart
 * n'est donc jamais a lui seul un argument de rangement automatique : le mail n'est range
 * seul que si ses candidates y suffisaient deja (toutes dans le meme dossier de binome).
 * Pas d'historique par expediteur (decision du 19/10/2026).
 */
export function departagerParGestionnaire(
  s: Suggestion,
  texte: string,
  ref: ReferentielTri,
  initialesParEmail: Record<string, string>,
): Suggestion {
  if (s.candidats.length < 2) return s;
  const gestionnaireDe = new Map<string, MembreTri>();
  for (const r of s.candidats) {
    const g = ref.copros.find((c) => c.reference === r)?.gestionnaire;
    if (g) gestionnaireDe.set(r, g);
  }
  const leurs = new Map([...gestionnaireDe.values()].map((g) => [minuscules(g.email), g]));
  if (leurs.size < 2) return s;

  const designes = new Map<string, string>();
  // Initiales -> gestionnaire, seulement des initiales portees par une seule personne.
  const parInitiales = new Map<string, string | null>();
  for (const [email, ini] of Object.entries(initialesParEmail)) {
    const cle = ini.trim().toUpperCase();
    if (cle) parInitiales.set(cle, parInitiales.has(cle) ? null : minuscules(email));
  }
  for (const m of texte.matchAll(MOTIF_REF_DOSSIER)) {
    const email = parInitiales.get(m[1]!);
    if (email && leurs.has(email)) designes.set(email, `Référence ${m[0]}`);
  }
  const plat = normaliser(texte).replace(/\s+/g, " ");
  for (const [email, g] of leurs) {
    const nom = normaliser(g.nomComplet).replace(/\s+/g, " ").trim();
    if (nom.split(" ").length < 2) continue;
    const echappe = nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?:^|[^a-z])${echappe} ?<[^>\\s]+@real31\\.fr>`).test(plat)) designes.set(email, designes.get(email) ?? `Signature de ${g.nomComplet}`);
  }
  if (designes.size !== 1) return s;
  const [email, source] = [...designes][0]!;
  const siennes = s.candidats.filter((r) => minuscules(gestionnaireDe.get(r)?.email ?? "") === email);
  if (siennes.length === 0 || siennes.length === s.candidats.length) return s;
  return {
    ...s,
    candidats: [...siennes, ...s.candidats.filter((r) => !siennes.includes(r))],
    raison: `${s.raison} ${source} dans l'échange : les copros de ${leurs.get(email)!.nomComplet} d'abord.`,
  };
}

/**
 * Historique du tri, MEME CONVERSATION seulement (decision Sekou du 19/10/2026) : un mail de
 * la meme conversation Graph a deja ete range dans `reference`. Jamais une piste sure : une
 * conversation peut deriver vers une autre copro, et le premier rangement a pu etre faux.
 *   - rien trouve (ou code hors perimetre) : piste faible sur cette copro ;
 *   - une piste faible ou plusieurs : la copro s'ajoute en DERNIERE candidate (le contenu du
 *     mail reste en tete), ou la raison le mentionne si elle y est deja ;
 *   - une piste sure : inchangee.
 * Pas d'historique par expediteur ni par numero de dossier.
 */
export function avecMemeConversation(s: Suggestion, reference: string | null | undefined, ref: ReferentielTri): Suggestion {
  if (!reference || s.nature === "sure") return s;
  const cle = cleDeReference(reference);
  const copro = ref.copros.find((c) => cleDeReference(c.reference) === cle);
  // La copro a quitte le perimetre de la boite depuis : on ne la propose plus.
  if (!copro) return s;
  const r = copro.reference;
  const phrase = `Un mail de la même conversation a été rangé dans ${r}`;
  if (s.nature === "aucune") return { nature: "faible", candidats: [r], raison: `${phrase}, à confirmer.`, origine: "conversation" };
  if (s.nature === "hors-estale") return { nature: "faible", candidats: [r], raison: `${phrase}, à confirmer. ${s.raison}`, origine: "conversation" };
  if (s.candidats.includes(r)) return { ...s, raison: `${s.raison} ${phrase}.` };
  return { nature: "plusieurs", candidats: [...s.candidats, r], raison: `${s.raison} ${phrase}, à confirmer.` };
}

/** Ou part le mail quand on l'attribue a une copro : le dossier du binome (ADR-046). */
export interface Destination {
  gestionnaire: MembreTri;
  /** Assistant du binome : celui tenu dans l'intranet, a defaut celui d'ESTALE. */
  assistant: MembreTri | null;
  /** Cle stable du dossier (le binome = son gestionnaire) : survit au changement d'assistant. */
  cle: string;
  /** Nom du dossier, ex "SK-CP" ; null si les initiales du gestionnaire sont inconnues. */
  nomDossier: string | null;
  /** Chemin affiche, ex "Boîte de réception › SK-CP" ; null = on ne peut pas ranger. */
  dossier: string | null;
}

/**
 * Les dossiers hors binome : Comptabilité et Divers (arbitrage du 30/09/2026), et « Transférés »
 * (REA-500, 06/11/2026) : un mail transféré depuis le tri a un collègue vente ou location (qui
 * n'a pas acces a la boite syndic) y est range une fois le transfert parti. On ne le range
 * jamais a la main (rangerMailAction ne l'accepte pas) : seul transfererMailTriAction y mene.
 * Comme Divers, il n'est distribue a personne dans « E-mails » (ni binome, ni comptables).
 */
export const DOSSIERS_HORS_BINOME = {
  comptabilite: "Comptabilité",
  divers: "Divers",
  transferes: "Transférés",
} as const;
export type DossierHorsBinome = keyof typeof DOSSIERS_HORS_BINOME;

/**
 * Ce qu'un collaborateur choisit pour un mail :
 * - une copro : le dossier de son binome, etiquete a son code ;
 * - un dossier de binome choisi librement, avec zero, une ou plusieurs etiquettes (une
 *   invitation d'un prestataire, des factures pour plusieurs copros : demande du 08/10) ;
 * - Comptabilité ou Divers ; « Transférés » apres un transfert depuis le tri (REA-500).
 */
export type CibleTri =
  | { type: "copro"; reference: string }
  | { type: "dossier"; cle: string; copros: string[] }
  | { type: DossierHorsBinome };

const cheminSousReception = (nom: string) => `Boîte de réception › ${nom}`;

/** "SK" + "CP" -> "SK-CP" ; binome sans assistant -> "SK". */
export function nomDossierBinome(initialesGestionnaire: string, initialesAssistant: string | null): string {
  const g = initialesGestionnaire.trim().toUpperCase();
  const a = initialesAssistant?.trim().toUpperCase();
  return a ? `${g}-${a}` : g;
}

/** Cle de dossier d'un binome : le gestionnaire (son e-mail), pas les initiales qui peuvent changer. */
export function cleDossierBinome(emailGestionnaire: string): string {
  return `binome:${emailGestionnaire.trim().toLowerCase()}`;
}

export function cheminDossierHorsBinome(d: DossierHorsBinome): string {
  return cheminSousReception(DOSSIERS_HORS_BINOME[d]);
}

/**
 * Un binome tenu dans l'intranet : un gestionnaire et UN de ses assistants. Un gestionnaire
 * a au plus un assistant principal, et peut en avoir d'autres quand ses copros sont
 * partagees (une gestionnaire et ses deux assistantes, arbitrage du 08/10/2026).
 */
export interface Binome {
  id: string;
  /** En minuscules. */
  gestionnaireEmail: string;
  assistant: MembreTri;
  /** L'assistant des copros sans affectation particuliere. */
  principal: boolean;
}

export interface BinomesTri {
  binomes: Binome[];
  /** Reference ESTALE -> id du binome qui s'occupe de cette copro (sinon le principal). */
  parCopro: Record<string, string>;
}

export const AUCUN_BINOME: BinomesTri = { binomes: [], parCopro: {} };

const minuscules = (e: string) => e.trim().toLowerCase();

/**
 * Le binome d'une copro, dans cet ordre :
 * 1. celui qui lui est affecte a la main (`parCopro`) ;
 * 2. celui dont l'assistant est l'assistant de la fiche de la copro (ESTALE, ou Crypto
 *    `assistantId` quand ESTALE ne le connait pas) ;
 * 3. le principal de son gestionnaire.
 * Pourquoi le 2 (27/10/2026, ADR-046 V2) : personne n'affecte les copros a la main, alors que
 * les fiches Crypto et ESTALE sont a jour. Sur syndic2, un mail de S077 (Emmanuel LOPES,
 * Galiano GUAETTA sur la fiche) partait dans EL-FS, le principal d'Emmanuel, au lieu d'EL-GG.
 * Une affectation qui pointe le binome d'un AUTRE gestionnaire (le mandat a change dans
 * ESTALE) est ignoree. Sans binome, `destinationDe` reprend l'assistant de la fiche.
 */
export function binomeDeCopro(copro: CoproTri, b: BinomesTri): Binome | null {
  if (!copro.gestionnaire) return null;
  const g = minuscules(copro.gestionnaire.email);
  const affecte = b.parCopro[copro.reference];
  const parAffectation = affecte ? b.binomes.find((x) => x.id === affecte && x.gestionnaireEmail === g) : undefined;
  return parAffectation ?? binomeDeLaFiche(copro, b) ?? b.binomes.find((x) => x.gestionnaireEmail === g && x.principal) ?? null;
}

/**
 * Le binome que designe la fiche de la copro, sans tenir compte des affectations a la main :
 * celui du gestionnaire dont l'assistant est l'assistant de la fiche ; sinon null.
 */
export function binomeDeLaFiche(copro: CoproTri, b: BinomesTri): Binome | null {
  if (!copro.gestionnaire || !copro.assistant?.email) return null;
  const g = minuscules(copro.gestionnaire.email);
  const a = minuscules(copro.assistant.email);
  return b.binomes.find((x) => x.gestionnaireEmail === g && minuscules(x.assistant.email) === a) ?? null;
}

/**
 * Cle du dossier. Le binome principal (ou le gestionnaire seul) garde la cle du
 * gestionnaire : poser ou changer l'assistant principal RENOMME le dossier existant
 * (« SC » -> « SC-GG »). Un binome secondaire a sa propre cle (son id).
 */
export function cleDossierDe(emailGestionnaire: string, binome: Binome | null): string {
  return !binome || binome.principal ? cleDossierBinome(emailGestionnaire) : `binome:${binome.id}`;
}

/**
 * Les dossiers de binôme d'une personne : ceux où elle est GESTIONNAIRE ou ASSISTANT(E), plus
 * le dossier « gestionnaire seul » à son nom. Sert à /mes-emails : « mes mails » sur la boîte
 * partagée = les rangements du tri vers ces dossiers (un assistant voit ceux de son binôme).
 */
export function clesDossiersDe(email: string, b: BinomesTri): Set<string> {
  const moi = minuscules(email);
  const cles = new Set<string>([cleDossierBinome(moi)]);
  for (const x of b.binomes) {
    if (x.gestionnaireEmail === moi || minuscules(x.assistant.email) === moi) cles.add(cleDossierDe(x.gestionnaireEmail, x));
  }
  return cles;
}

/**
 * Les dossiers qu'une personne lit dans une boite partagee de « E-mails ». Un COMPTABLE (role
 * COMPTABLE de public."User", decision Sekou du 28/10/2026) lit le seul dossier « Comptabilité »,
 * jamais ceux des binomes ; les autres, les dossiers de leurs binomes (clesDossiersDe).
 */
export function clesDossiersLus(p: { email: string; comptable: boolean }, b: BinomesTri): Set<string> {
  const comptabilite: DossierHorsBinome = "comptabilite";
  return p.comptable ? new Set([comptabilite]) : clesDossiersDe(p.email, b);
}

/**
 * Le portefeuille de mes dossiers de binome (30/10/2026) : les cles de reference (S062,
 * cleDeReference) des copros que le tri rangerait dans l'un de ces dossiers (meme calcul que
 * destinationDe : binomeDeCopro puis cleDossierDe), et celles des AUTRES copros du referentiel
 * (d'un autre binome, ou sans gestionnaire). Un comptable (dossier « Comptabilité ») n'a aucune
 * copro a lui. Sert aux « Envoyés » d'une boite partagee : un mail neuf ecrit sur ma copro.
 */
export function portefeuilleDesDossiers(copros: CoproTri[], b: BinomesTri, cles: ReadonlySet<string>): { miennes: Set<string>; autres: Set<string> } {
  const miennes = new Set<string>();
  const autres = new Set<string>();
  for (const c of copros) {
    const ref = cleDeReference(c.reference);
    if (!ref) continue;
    const cle = c.gestionnaire ? cleDossierDe(minuscules(c.gestionnaire.email), binomeDeCopro(c, b)) : null;
    (cle !== null && cles.has(cle) ? miennes : autres).add(ref);
  }
  // Une reference vue des deux cotes (doublon du referentiel) : prudence, elle n'est pas a moi.
  for (const ref of autres) miennes.delete(ref);
  return { miennes, autres };
}

/**
 * Destination d'un mail rattache a une copro. Les initiales viennent de l'intranet et
 * non d'ESTALE : le nom complet ESTALE ne donne souvent qu'un prenom (constat du 25/09).
 * L'assistant vient du binome tenu dans l'intranet ; a defaut seulement, de celui d'ESTALE.
 */
export function destinationDe(
  copro: CoproTri,
  initialesParEmail: Record<string, string>,
  b: BinomesTri = AUCUN_BINOME,
): Destination | null {
  if (!copro.gestionnaire) return null;
  const emailG = minuscules(copro.gestionnaire.email);
  const binome = binomeDeCopro(copro, b);
  const assistant = binome ? binome.assistant : copro.assistant;
  const iniG = initialesParEmail[emailG]?.trim() || null;
  const iniA = assistant ? initialesParEmail[minuscules(assistant.email)]?.trim() || null : null;
  const nomDossier = iniG ? nomDossierBinome(iniG, iniA) : null;
  return {
    gestionnaire: copro.gestionnaire,
    assistant,
    cle: cleDossierDe(emailG, binome),
    nomDossier,
    dossier: nomDossier ? cheminSousReception(nomDossier) : null,
  };
}

/** Une ligne du journal du tri : ce qui a ete range, ou, par qui, sur quel signal. */
export interface EntreeJournalTri {
  id: string;
  boite: string;
  internetMessageId: string;
  /** Id Graph du mail APRES deplacement (sert a l'annulation). */
  messageId: string;
  /** Conversation Graph du mail : l'historique du tri ne sert qu'a la meme conversation. */
  conversationId?: string;
  expediteur: string;
  objet: string;
  /** La copro principale du rangement (mesure des signaux) ; null s'il n'y en a pas. */
  coproReference: string | null;
  /** Toutes les etiquettes posees (codes copro) ; vide pour Comptabilité / Divers. */
  copros: string[];
  /** Nom du dossier au moment du rangement, ex "SK-CP" ou "Comptabilité". */
  dossierNom: string;
  /** Cle stable du dossier (binome:..., comptabilite, divers) ; null sur les toutes premieres lignes. */
  dossierCle: string | null;
  /** La suggestion au moment du clic : sa nature et ses candidates (mesure de fiabilite). */
  signal: SignalTri | null;
  candidats: string[];
  /** true = rangement simule (ecriture Graph coupee) : le mail n'a pas bouge. */
  simulation: boolean;
  par: string;
  faitLe: string;
  annuleLe: string | null;
  /**
   * Journal transactionnel (REA-420, 27/10/2026) : « en_cours » = ligne ecrite AVANT le
   * deplacement, pas encore confirmee ; « fait » = rangement confirme. Absent : colonne pas
   * encore creee (intranet_tri_journal_etat.sql), la ligne vaut « fait ».
   */
  etat?: EtatLigneJournal;
}

export type EtatLigneJournal = "en_cours" | "fait";

/**
 * Une ligne « en_cours » plus jeune que ce delai est un rangement en train de se faire : elle
 * compte comme « deja range » (on ne le relance pas). Plus vieille, le geste a ete interrompu
 * (Supabase ou la fonction coupee entre le deplacement et la confirmation) : les lectures
 * l'ignorent et la tache planifiee la reprend (reprendre-en-cours.ts).
 */
export const DELAI_RANGEMENT_EN_COURS_MS = 2 * 60_000;

/**
 * Le signal retenu par le journal : la nature de la suggestion du mail, « pj » quand la
 * copro a ete proposee par la lecture des pieces jointes (coproDepuisPiecesJointes), ou
 * « conversation » quand la seule piste etait un mail de la meme conversation deja range.
 * Valeur de la colonne texte `signal` de intranet_tri_journal, sans contrainte en base.
 */
export type SignalTri = NatureSuggestion | "pj" | "conversation";

/**
 * Ce que le rangement journalise. Audit du journal du tri (19/10/2026) : quand le mail ne
 * donnait aucune piste et que la copro venait d'un PDF, le journal notait « aucune piste » ;
 * la mesure des signaux sous-estimait la lecture des pieces jointes. Si le mail avait deja
 * des candidates, on garde sa suggestion : c'est elle que la revue mesure.
 */
export function signalDuRangement(
  suggestion: { nature: NatureSuggestion; candidats: string[]; origine?: OrigineSuggestion },
  pj: { candidats: string[] } | null,
): { nature: SignalTri; candidats: string[] } {
  if (suggestion.candidats.length === 0 && pj && pj.candidats.length > 0) return { nature: "pj", candidats: pj.candidats };
  if (suggestion.origine === "conversation") return { nature: "conversation", candidats: suggestion.candidats };
  return { nature: suggestion.nature, candidats: suggestion.candidats };
}

/** La suggestion a-t-elle ete suivie ? Sert a mesurer chaque signal avant de l'automatiser. */
export function suggestionSuivie(e: Pick<EntreeJournalTri, "coproReference" | "candidats">): boolean | null {
  if (e.candidats.length === 0) return null;
  return e.coproReference !== null && e.candidats[0] === e.coproReference;
}

/** Intitule ESTALE d'un assistant de copropriete (pas "Assistante commerciale", pas "Assistant comptable"). */
export function estAssistantDeCopro(intitule: string | null | undefined): boolean {
  return /\bassistant(e)?\s+de\s+copro/i.test(intitule ?? "");
}

/** Un binome tel que l'ecran le montre, avec le dossier qui en decoule. */
export interface BinomeAffiche extends Binome {
  nomDossier: string | null;
}

/** Une ligne de l'ecran des binomes : un gestionnaire, ses assistants, ses copros ESTALE. */
export interface LigneBinome {
  gestionnaire: MembreTri;
  principal: BinomeAffiche | null;
  autres: BinomeAffiche[];
  /**
   * Ses copros ; `binomeId` = le binome qui la recoit quand ce n'est pas le principal
   * (affectation a la main, ou assistant de la fiche depuis le 27/10/2026) ; null : le principal.
   */
  copros: { reference: string; nom: string; binomeId: string | null }[];
  /** Assistant de copropriete connu d'ESTALE, propose quand l'intranet n'a pas de principal. */
  assistantEstale: MembreTri | null;
  /** Le dossier sans aucun assistant, ex "SC" ; null si les initiales manquent. */
  nomDossierSeul: string | null;
}

/**
 * Les lignes de l'ecran des binomes. Les gestionnaires listes = ceux des copros ESTALE ET
 * ceux du cabinet (`gestionnaires`) : un binome se pose avant que les copros arrivent sur
 * ESTALE (EL-FS, RB-WHT, demande du 08/10/2026). Tries par nom.
 */
export function lignesBinomes(
  gestionnaires: MembreTri[],
  copros: CoproTri[],
  b: BinomesTri,
  initialesParEmail: Record<string, string>,
): LigneBinome[] {
  const ini = (email: string) => initialesParEmail[minuscules(email)]?.trim() || null;
  const affiche = (x: Binome): BinomeAffiche => {
    const iniG = ini(x.gestionnaireEmail);
    return { ...x, nomDossier: iniG ? nomDossierBinome(iniG, ini(x.assistant.email)) : null };
  };

  const parG = new Map<string, { g: MembreTri; copros: CoproTri[] }>();
  for (const g of gestionnaires) parG.set(minuscules(g.email), { g, copros: [] });
  for (const c of copros) {
    if (!c.gestionnaire) continue;
    const cle = minuscules(c.gestionnaire.email);
    const l = parG.get(cle) ?? { g: c.gestionnaire, copros: [] };
    l.copros.push(c);
    parG.set(cle, l);
  }
  // Un binome deja pose pour un gestionnaire absent des deux listes reste visible.
  for (const x of b.binomes) {
    if (!parG.has(x.gestionnaireEmail)) parG.set(x.gestionnaireEmail, { g: { nomComplet: x.gestionnaireEmail, email: x.gestionnaireEmail }, copros: [] });
  }

  return [...parG.entries()]
    .map(([cle, l]) => {
      const siens = b.binomes.filter((x) => x.gestionnaireEmail === cle);
      const principal = siens.find((x) => x.principal) ?? null;
      const iniG = ini(cle);
      return {
        gestionnaire: l.g,
        principal: principal ? affiche(principal) : null,
        autres: siens.filter((x) => !x.principal).map(affiche),
        copros: l.copros
          .map((c) => {
            const x = binomeDeCopro(c, b);
            return { reference: c.reference, nom: c.nom, binomeId: x && !x.principal ? x.id : null };
          })
          .sort((x, y) => x.reference.localeCompare(y.reference)),
        assistantEstale: l.copros.find((c) => c.assistant)?.assistant ?? null,
        nomDossierSeul: iniG ? nomDossierBinome(iniG, null) : null,
      };
    })
    .sort((x, y) => x.gestionnaire.nomComplet.localeCompare(y.gestionnaire.nomComplet, "fr"));
}

/** Auteur des lignes de journal deduites d'un deplacement fait a la main dans Outlook. */
export const PAR_OUTLOOK = "outlook";

/** Auteur des lignes de journal du rangement automatique (tache planifiee, piste sure). */
export const PAR_AUTOMATIQUE = "automatique";

/**
 * Auteur des annulations decidees par l'app elle-meme (REA-420) : deplacement refuse (le mail
 * n'etait plus en reception), rangement interrompu que la reprise trouve encore en reception
 * ou introuvable.
 */
export const PAR_SYSTEME = "systeme";

/** Pourquoi un mail de la file n'est pas range automatiquement (bilan de la tache planifiee). */
export type RefusAutomatique =
  /** L'automatique est coupe pour cette boite (config de la boite ou MAIL_TRI_AUTO). */
  | "automatique-coupe"
  | "corbeille"
  | "interne"
  | "pas-sure"
  | "deja-passe"
  | "copro-inconnue"
  | "copro-inactive"
  | "sans-destination"
  /** Lecture des PDF (rangeableParPiecesJointes) : aucune copro trouvee. */
  | "pj-aucune"
  /** Les PDF designent plusieurs copros. */
  | "pj-plusieurs"
  /** Le PDF designe une copro que le mail ne propose pas. */
  | "pj-conflit";

// Objets qui relevent de la comptabilite, quelle que soit la copro (etude du tri v2, 03/11/2026 :
// 9 justes sur 9 sur les 930 lignes du 26/10 au 02/11, dont 7 rangements automatiques defaits
// puis reclasses a la main en Comptabilite). Volontairement etroit : « appels de fonds »,
// « répartition disponible en ligne » ou « RIB » vont aussi chez le gestionnaire (mesure : 13
// faux sur 26 avec eux), ils restent hors de la regle.
// « Relevé DU compteur électrique du parking » (S062) est une question technique pour le
// gestionnaire : seul « relevé (de/des) compteur(s) » compte.
const OBJET_COMPTABILITE = /\brelev(?:e|es) (?:de |des )?compteurs?\b|\bvirement a votre credit\b|\breglement (?:des |de )?charges\b/;

/** Ce mail est-il pour la Comptabilité, d'apres son objet (relevé de compteur, virement reçu, règlement de charges) ? */
export function objetPourLaComptabilite(objet: string): boolean {
  return OBJET_COMPTABILITE.test(normaliser(objet));
}

/**
 * La piste du mail suffit-elle a ranger sans clic ? Une piste « sure » (hors historique de la
 * conversation), ou, depuis le 26/10/2026 (mesure : 15 faibles mono-candidat sur 15 justes),
 * une piste « faible » trouvee par le nom de l'immeuble ou son adresse (origine
 * « nom-adresse »). Depuis le 03/11/2026 (etude du tri v2), aussi un code cite dans le corps
 * (« code-corps ») et une adresse sans ville sur une rue d'une seule ville (« adresse-sans-lieu ») ;
 * jamais un fournisseur seul, une adresse a une lettre pres, ni une copro inactive
 * (coproRangeable). Toujours sur UNE seule copro.
 */
export function pisteRangeable(s: Suggestion): boolean {
  if (s.candidats.length !== 1) return false;
  if (s.nature === "sure") return s.origine !== "conversation";
  return s.nature === "faible" && (s.origine === "nom-adresse" || s.origine === "code-corps" || s.origine === "adresse-sans-lieu" || s.origine === "jumelle");
}

/**
 * Ce mail de la file peut-il etre range SANS clic (ADR-046 : « un clic d'abord, puis de
 * l'automatique signal par signal ») ? Seulement si TOUT est reuni :
 *   - l'automatique est ouvert pour la boite (`ctx.automatique` : drapeau `automatique` de
 *     sa config ET MAIL_TRI_AUTO ; jusqu'au 27/10/2026, une constante syndic4 en dur) ;
 *   - ni corbeille proposee (reponse automatique, publicite apprise) ni mail interne. Un avis
 *     de non-remise (03/11/2026) n'a pas de corbeille : il suit les regles d'un mail normal,
 *     sur la piste de suggererCoproNonRemis ;
 *   - piste rangeable (pisteRangeable), sur UNE seule copro : « sure », ou « faible » par le
 *     nom de l'immeuble ou son adresse. Pas « plusieurs », pas un code dans le corps, pas un
 *     fournisseur seul, pas l'historique de la conversation ;
 *   - le mail n'est jamais passe par le journal : ni range, ni range puis annule (quelqu'un
 *     l'a remis dans la file : il veut decider lui-meme) ;
 *   - la copro est dans le referentiel, active (deja plafonnee a « faible » par
 *     suggererCopro : on reverifie) et son dossier de binome est connu (gestionnaire au
 *     mandat et initiales).
 * Copro INACTIVE (28/10/2026) : rangee sans clic seulement quand elle est designee par un
 * identifiant explicite (son code dans l'objet, son immatriculation : `identifiant`), seule
 * candidate, au dossier connu ; jamais par l'expediteur, le nom, l'adresse ni un PDF.
 * Plusieurs candidates qui menent TOUTES au meme dossier de binome (28/10/2026) : le mail y
 * est range, avec l'etiquette de chacune (`dossier`), sans choisir la copro. Toutes actives,
 * au dossier connu, par la meme resolution que le rangement (destinationDe, binomes reels).
 * Pure : le service fournit le referentiel et le journal.
 */
export function rangeableAutomatiquement(
  mail: Pick<MailATrier, "corbeille" | "interne"> & Partial<Pick<MailATrier, "objet" | "nonRemis">> & { suggestion: Suggestion },
  ctx: {
    /** L'automatique est ouvert pour la boite du mail (config de la boite ET MAIL_TRI_AUTO). */
    automatique: boolean;
    /** Le mail a au moins une ligne de journal, annulee ou non. */
    dejaPasse: boolean;
    copros: CoproTri[];
    initialesParEmail: Record<string, string>;
    binomes?: BinomesTri;
  },
): DecisionAutomatique {
  if (!ctx.automatique) return { ok: false, motif: "automatique-coupe" };
  if (mail.corbeille) return { ok: false, motif: "corbeille" };
  const s = mail.suggestion;
  // Mail d'un collègue (boîte en copie) : rangé seul seulement quand il désigne UNE copro de
  // façon sûre, son code dans l'objet ou « Immeuble concerné » (étude du tri v2, 03/11/2026 :
  // 5 justes sur 6, le dernier étant un doublon jeté). Sinon, à l'humain.
  if (mail.interne && !(s.nature === "sure" && s.candidats.length === 1 && s.origine !== "conversation")) return { ok: false, motif: "interne" };
  // Relevé de compteur, virement reçu, règlement de charges (03/11/2026) : en Comptabilité,
  // étiqueté de sa copro quand la piste en désigne une seule et rangeable. Pas un avis de
  // non-remise : il part au binôme, qui rappelle le copropriétaire.
  if (mail.objet && !mail.nonRemis && !mail.interne && objetPourLaComptabilite(mail.objet)) {
    if (ctx.dejaPasse) return { ok: false, motif: "deja-passe" };
    const copro = s.candidats.length === 1 && (pisteRangeable(s) || s.identifiant) ? s.candidats : [];
    return { ok: true, comptabilite: { copros: copro } };
  }
  if (s.nature === "faible" && s.identifiant && s.candidats.length === 1) {
    if (ctx.dejaPasse) return { ok: false, motif: "deja-passe" };
    return coproRangeable(s.candidats[0]!, ctx, { inactiveAdmise: true });
  }
  if (!pisteRangeable(s)) {
    const commun = s.nature === "plusieurs" ? dossierCommun(s.candidats, ctx) : null;
    if (!commun) return { ok: false, motif: "pas-sure" };
    if (ctx.dejaPasse) return { ok: false, motif: "deja-passe" };
    return { ok: true, dossier: commun };
  }
  if (ctx.dejaPasse) return { ok: false, motif: "deja-passe" };
  return coproRangeable(s.candidats[0]!, ctx);
}

type ContexteAutomatique = Parameters<typeof rangeableAutomatiquement>[1];

/**
 * Decision du rangement automatique : une copro (son dossier de binome, son etiquette), ou un
 * dossier de binome commun a plusieurs candidates (etiquetees toutes les deux).
 */
export type DecisionAutomatique =
  | { ok: true; reference: string }
  | { ok: true; dossier: { cle: string; copros: string[] } }
  /** Le dossier Comptabilité, avec l'étiquette de la copro quand elle est connue (objetPourLaComptabilite). */
  | { ok: true; comptabilite: { copros: string[] } }
  | { ok: false; motif: RefusAutomatique };

/**
 * Le dossier de binome commun a ces copros (au moins deux), ou null : une seule inconnue,
 * inactive ou sans dossier, ou deux dossiers differents, et on laisse choisir.
 */
function dossierCommun(references: string[], ctx: ContexteAutomatique): { cle: string; copros: string[] } | null {
  const refs = [...new Set(references)];
  if (refs.length < 2) return null;
  const cles = new Set<string>();
  for (const r of refs) {
    const copro = ctx.copros.find((c) => c.reference === r);
    if (!copro || copro.inactive) return null;
    const dest = destinationDe(copro, ctx.initialesParEmail, ctx.binomes);
    if (!dest?.nomDossier) return null;
    cles.add(dest.cle);
  }
  return cles.size === 1 ? { cle: [...cles][0]!, copros: refs } : null;
}

/**
 * La copro existe, est active (ou inactive admise : citee par son code) et son dossier de
 * binome est connu.
 */
function coproRangeable(reference: string, ctx: ContexteAutomatique, o: { inactiveAdmise?: boolean } = {}): DecisionAutomatique {
  const copro = ctx.copros.find((c) => c.reference === reference);
  if (!copro) return { ok: false, motif: "copro-inconnue" };
  if (copro.inactive && !o.inactiveAdmise) return { ok: false, motif: "copro-inactive" };
  if (!destinationDe(copro, ctx.initialesParEmail, ctx.binomes)?.nomDossier) return { ok: false, motif: "sans-destination" };
  return { ok: true, reference: copro.reference };
}

/**
 * Faut-il lire les PDF de ce mail dans la tache planifiee (decision Sekou du 26/10/2026) ?
 * Seulement un mail refuse faute de piste rangeable (« pas-sure » : les autres refus,
 * corbeille, interne, automatique coupe, ne changeront pas), jamais passe par le journal, avec des
 * pieces jointes, et qui ne cite pas un code hors perimetre (il parle d'une autre agence).
 */
export function aLirePiecesJointes(
  mail: Pick<MailATrier, "aPiecesJointes"> & Partial<Pick<MailATrier, "deAdresse" | "objet">> & { suggestion: Suggestion },
  decision: DecisionAutomatique,
  dejaPasse: boolean,
): boolean {
  // Recommande AR24 non delivre (03/11/2026) : son PDF est la preuve d'AR24, qui porte l'en-tete
  // du cabinet et le nom du destinataire, pas l'immeuble. Il n'est pas lu.
  if (mail.deAdresse && mail.objet && estRecommandeAr24NonDelivre({ deAdresse: mail.deAdresse, objet: mail.objet })) return false;
  return !decision.ok && decision.motif === "pas-sure" && mail.aPiecesJointes && !dejaPasse && mail.suggestion.nature !== "hors-estale";
}

/**
 * Le mail peut-il etre range SANS clic sur la foi de ses PDF ? Memes garde-fous que
 * rangeableAutomatiquement (automatique ouvert pour la boite, ni corbeille ni interne, jamais passe par le journal,
 * copro active au dossier connu), et :
 *   - les PDF du mail, TOUS lus, designent UNE seule copro (`pdf` : leur union) ;
 *   - si le mail lui-meme propose des copros (« plusieurs », fournisseur, code dans le corps),
 *     celle du PDF doit en faire partie : deux indices qui se contredisent, c'est un humain
 *     qui tranche ;
 *   - plusieurs copros dans les PDF (28/10/2026) : rangees ensemble quand elles menent toutes
 *     au meme dossier de binome (et, si le mail en propose, qu'elles en font toutes partie).
 */
export function rangeableParPiecesJointes(
  mail: Pick<MailATrier, "corbeille" | "interne"> & { suggestion: Suggestion },
  pdf: string[],
  ctx: ContexteAutomatique,
): DecisionAutomatique {
  if (!ctx.automatique) return { ok: false, motif: "automatique-coupe" };
  if (mail.corbeille) return { ok: false, motif: "corbeille" };
  if (mail.interne) return { ok: false, motif: "interne" };
  if (ctx.dejaPasse) return { ok: false, motif: "deja-passe" };
  if (mail.suggestion.nature === "hors-estale") return { ok: false, motif: "pas-sure" };
  if (pdf.length === 0) return { ok: false, motif: "pj-aucune" };
  const candidats = mail.suggestion.candidats;
  if (candidats.length > 0 && !pdf.every((r) => candidats.includes(r))) return { ok: false, motif: pdf.length > 1 ? "pj-plusieurs" : "pj-conflit" };
  if (pdf.length > 1) {
    const commun = dossierCommun(pdf, ctx);
    return commun ? { ok: true, dossier: commun } : { ok: false, motif: "pj-plusieurs" };
  }
  return coproRangeable(pdf[0]!, ctx);
}

/** Un dossier deja cree par l'app dans la boite. */
export interface DossierConnu {
  cle: string;
  folderId: string;
  nom: string;
}

/** Ce que l'app constate en relisant un mail qu'elle a range. */
export type ConstatRangement =
  | { cas: "en-place" }
  /** Remis dans la boite de reception generique : retour dans la file. */
  | { cas: "remis-en-reception" }
  /** Glisse dans un autre dossier que l'app connait. */
  | { cas: "deplace"; vers: DossierConnu }
  /** Supprime, ou range dans un dossier que l'app ne connait pas : on n'y touche pas. */
  | { cas: "introuvable" };

/**
 * Ou en est un mail range, d'apres sa position actuelle dans la boite (null = introuvable).
 * Un mail glisse a la main dans Outlook change d'id Graph : la position se retrouve par
 * l'internetMessageId, qui, lui, ne change jamais.
 */
export function constaterRangement(
  dossierCle: string,
  position: { folderId: string; enReception: boolean } | null,
  dossiers: DossierConnu[],
): ConstatRangement {
  if (!position) return { cas: "introuvable" };
  if (position.enReception) return { cas: "remis-en-reception" };
  const ici = dossiers.find((d) => d.folderId === position.folderId);
  if (!ici) return { cas: "introuvable" };
  if (ici.cle === dossierCle) return { cas: "en-place" };
  return { cas: "deplace", vers: ici };
}

/**
 * La copro a deduire d'un dossier : celle-la seule si le dossier ne recoit qu'une copro
 * ESTALE, sinon null (« copro a preciser »). Comptabilité et Divers n'ont pas de copro.
 */
export function coproDuDossier(
  cle: string,
  copros: CoproTri[],
  initialesParEmail: Record<string, string>,
  b: BinomesTri,
): string | null {
  // Une copro inactive ne rend pas le dossier ambigu : elle ne recoit plus de courrier suivi.
  const candidates = copros.filter((c) => !c.inactive && destinationDe(c, initialesParEmail, b)?.cle === cle);
  return candidates.length === 1 ? candidates[0]!.reference : null;
}

/** Un dossier de binome qu'on peut choisir a la main. */
export interface DossierChoisissable {
  cle: string;
  nom: string;
  /** Ce qu'on lit dans la liste, ex "AB-CD · Alice BERNARD avec Claude DUPONT". */
  libelle: string;
}

/**
 * Tous les dossiers de binome qu'on peut viser a la main : le principal (ou le gestionnaire
 * seul) et les autres assistants de chaque gestionnaire. Sans initiales, pas de dossier.
 */
export function dossiersChoisissables(lignes: LigneBinome[]): DossierChoisissable[] {
  const out: DossierChoisissable[] = [];
  for (const l of lignes) {
    const g = l.gestionnaire.nomComplet;
    const nomPrincipal = l.principal?.nomDossier ?? l.nomDossierSeul;
    if (nomPrincipal) {
      out.push({
        cle: cleDossierBinome(l.gestionnaire.email),
        nom: nomPrincipal,
        libelle: l.principal ? `${nomPrincipal} · ${g} avec ${l.principal.assistant.nomComplet}` : `${nomPrincipal} · ${g}`,
      });
    }
    for (const a of l.autres) {
      if (a.nomDossier) out.push({ cle: `binome:${a.id}`, nom: a.nomDossier, libelle: `${a.nomDossier} · ${g} avec ${a.assistant.nomComplet}` });
    }
  }
  return out;
}

/**
 * Proposition de bascule (etude du tri v2, R3, 03/11/2026) : un mail sans aucune piste dans la
 * boite, qui designe UNE copro d'une autre agence (son code, l'expediteur, son nom ou son
 * adresse, rangeable si elle etait de la boite), est propose a la bascule vers l'agence de
 * cette copro. Une PROPOSITION : la nature reste « aucune », rien n'est fait sans clic.
 * `autres` : le referentiel des autres agences (l'agence vient de la fiche de la copro).
 */
export function proposerAutreAgence(
  s: Suggestion,
  mail: Pick<MailATrier, "deAdresse" | "objet" | "apercu"> & { corps?: string; corbeille?: MotifCorbeille; interne?: boolean },
  autres: ReferentielTri,
  /** La piste cherchee dans les autres agences ; le moteur ordinaire par defaut (AR24 : suggererCoproAr24). */
  piste: (r: ReferentielTri) => Suggestion = (r) => suggererCopro(mail, r),
): Suggestion {
  // « hors-estale » : un code cité qui n'est pas de la boîte, le cas le plus net d'une autre agence.
  if ((s.nature !== "aucune" && s.nature !== "hors-estale") || s.candidats.length > 0 || mail.corbeille || mail.interne || autres.copros.length === 0) return s;
  const ailleurs = piste(autres);
  if (ailleurs.candidats.length !== 1 || !(ailleurs.nature === "sure" || pisteRangeable(ailleurs))) return s;
  const reference = ailleurs.candidats[0]!;
  const copro = autres.copros.find((c) => c.reference === reference);
  const agence = copro?.agence ?? null;
  const sure = copro ? pisteAutreAgenceStricte(ailleurs, mail, copro) : false;
  return {
    ...s,
    raison: `${ailleurs.raison.replace(/,? à confirmer\.?$/, ".")} Cette copropriété (${reference}) est d'une autre agence${agence ? ` (${agence})` : ""} : ${sure ? "piste sûre, basculé seul vers son agence par la tâche planifiée quand la bascule est ouverte." : "à basculer ?"}`,
    autreAgence: { reference, agence, ...(sure ? { sure: true as const } : {}) },
  };
}

/**
 * La piste vers une copro d'une autre agence est-elle assez sure pour basculer seul (decision
 * Sekou du 03/11/2026 : « si on est sur, elle doit etre transferee a l'autre agence ») ?
 * Seulement : son code exact dans l'objet ou son immatriculation, ou son
 * nom ET son adresse complete (numero, rue, lieu) cites ensemble. Jamais l'expediteur seul,
 * une adresse sans lieu ou a une lettre pres, un nom seul, l'historique de la conversation.
 */
export function pisteAutreAgenceStricte(ailleurs: Suggestion, mail: Pick<MailATrier, "objet" | "apercu">, copro: CoproTri): boolean {
  if (ailleurs.candidats.length !== 1 || ailleurs.candidats[0] !== copro.reference) return false;
  // Le code dans le CORPS reste une proposition : rejeu du 03/11/2026, « V.REF : S261/… » d'un
  // avocat (recouvrement) etait range en Comptabilite par l'humain, pas bascule (seul faux).
  if (ailleurs.identifiant) return true;
  if (ailleurs.origine !== "nom-adresse") return false;
  const texte = `${mail.objet}\n${retirerEnteteCabinet(nettoyerCorps(mail.apercu)).slice(0, TETE_CORPS)}`;
  const parNom = indicesNomAdresse(texte, [{ ...copro, adresse: "", adressesSecondaires: [] }]);
  const parAdresse = indicesNomAdresse(texte, [{ ...copro, nom: "", nomsUsage: [] }], { approche: false });
  return parNom.length === 1 && parAdresse.length === 1;
}

/**
 * Bascule automatique (03/11/2026) : la copro d'une autre agence et son agence, quand la piste
 * est vraiment sure (autreAgence.sure) et que rien ne s'y oppose : automatique ouvert, ni
 * corbeille, ni collegue, ni avis de non-remise, jamais un mail deja passe par le journal.
 * Le service verifie ensuite la garde de la bascule (refusBascule : ecriture ouverte sur les
 * deux boites) ; refusee, le mail reste en proposition.
 */
export function basculeAutomatique(
  mail: Pick<MailATrier, "corbeille" | "interne" | "nonRemis"> & { suggestion: Suggestion },
  ctx: { automatique: boolean; dejaPasse: boolean },
): { reference: string; agence: string } | null {
  const a = mail.suggestion.autreAgence;
  if (!ctx.automatique || ctx.dejaPasse || mail.corbeille || mail.interne || mail.nonRemis) return null;
  if (!a?.sure || !a.agence || mail.suggestion.candidats.length > 0) return null;
  return { reference: a.reference, agence: a.agence };
}

/**
 * Les references hesitent-elles exactement entre les deux fiches d'une paire de jumelles
 * (COPROS_JUMELLES) ? Alors la fiche a retenir : la secondaire si le texte la designe (son
 * code, son nom exact, un marqueur), sinon la principale. null sinon (une seule fiche, une
 * troisieme copro, aucune paire).
 */
export function choixJumelle(references: string[], texte: string): { reference: string; pourquoi: string } | null {
  const cles = [...new Set(references.map((r) => cleDeReference(r) ?? r))];
  if (cles.length !== 2) return null;
  const paire = COPROS_JUMELLES.find((j) => cles.includes(cleDeReference(j.principale)!) && cles.includes(cleDeReference(j.secondaire)!));
  if (!paire) return null;
  const vraie = (cle: string) => references.find((r) => (cleDeReference(r) ?? r) === cle)!;
  const plat = ` ${normaliser(texte).replace(/[^a-z0-9]+/g, " ").trim()} `;
  const codeSecondaire = referencesCitees(texte).includes(cleDeReference(paire.secondaire)!);
  const codePrincipale = referencesCitees(texte).includes(cleDeReference(paire.principale)!);
  if ((codeSecondaire && !codePrincipale) || paire.marqueursSecondaire.test(plat)) {
    return { reference: vraie(cleDeReference(paire.secondaire)!), pourquoi: `le mail désigne ${paire.secondaire}` };
  }
  return { reference: vraie(cleDeReference(paire.principale)!), pourquoi: `fiche principale de la paire ${paire.libelle}, son binôme redistribue` };
}

/** Une piste « plusieurs » entre deux jumelles devient une piste rangeable sur la fiche retenue (choixJumelle). */
function departagerJumelles(s: Suggestion, texte: string): Suggestion {
  if (s.nature !== "plusieurs") return s;
  const choix = choixJumelle(s.candidats, texte);
  if (!choix) return s;
  return { nature: "faible", candidats: [choix.reference], raison: `${s.raison} Copros jumelles : ${choix.reference} (${choix.pourquoi}).`, origine: "jumelle" };
}
