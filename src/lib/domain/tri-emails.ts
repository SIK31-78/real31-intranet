// Tri des e-mails V2 (ADR-046) : l'intranet lit la boite de reception d'une boite
// partagee generique et PROPOSE une copropriete ESTALE pour chaque mail ; au clic, le
// mail part dans le sous-dossier du gestionnaire (increment 2). On repond dans Outlook.
// Domaine pur : aucune lecture d'env, aucun appel reseau -> testable tel quel.
//
// Perimetre : les coproprietes ESTALE ET Crypto de l'agence de la boite (decision Sekou du
// 12/10/2026 : syndic4, agence de Houilles, avant la migration). Un mail qui cite une copro
// hors de ce perimetre est signale « hors périmètre », jamais rattache. Le code de nature
// reste "hors-estale" : il est deja ecrit dans le journal.

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
   * Copro INACTIVE dans l'intranet (mandat termine) : on recoit encore des mails de l'ancien
   * syndic, de coproprietaires, de locataires. Reconnue, mais au plus en piste faible.
   */
  inactive?: boolean;
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

  return {
    copros: [...parCle.values()],
    expediteurs,
    avertissements: [...(estale?.avertissements ?? []), ...(crypto?.avertissements ?? [])],
  };
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
  /** Avis de non-remise ou reponse automatique : le tri propose la corbeille (motifCorbeille). */
  corbeille?: MotifCorbeille;
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
   *     Jamais pour un fournisseur seul, un code dans le corps, l'historique de la conversation.
   */
  origine?: OrigineSuggestion;
}

export type OrigineSuggestion = "conversation" | "nom-adresse";

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
    .split(/[-/,;]| et /)
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
  if (distinctifs.length === 0) return false;
  if (distinctifs.length >= 2) return distinctifs.every((m) => mots.has(m));
  const noyau = noyauDe(nomUsage);
  while (noyau.length > 1 && PREFIXES_GENERIQUES.has(noyau[0]!)) noyau.shift();
  if (noyau.length >= 2) return noyauTexte.includes(` ${noyau.join(" ")} `);
  return distinctifs[0]!.length >= 5 && mots.has(distinctifs[0]!);
}

/**
 * Copros dont le NOM d'immeuble ou l'ADRESSE est cite dans le texte (objet + apercu). Indice
 * faible, a confirmer : les prestataires ecrivent « LE CYRANO » ou « 71 rue de Bezons »
 * plutot que le code. Deux garde-fous contre les faux positifs :
 *   - du nom, on retire les mots de ville (de tout le referentiel) ; il faut >= 2 mots
 *     distinctifs presents, ou un seul d'au moins 5 lettres ; un nom qui est une adresse
 *     (« 12 RUE … ») ne compte pas comme nom ;
 *   - une adresse ne compte que si le type de voie et ses mots porteurs sont cites, ET que
 *     le code postal ou la ville de la copro apparait aussi (« 71 rue de Bezons » a
 *     Carrieres ne matche pas un mail de Bezons), ET l'un de ses numeros. Une lettre d'ecart
 *     dans un mot de rue d'au moins 5 lettres est toleree (« SAMBAT » pour « Sembat ») quand
 *     le numero est cite, et seulement si aucune adresse n'est citee exactement. On rend au
 *     plus une raison par copro : les copros trouvees par le nom d'abord, puis par l'adresse.
 * L'appelant ne passe ici que l'objet et le DEBUT du corps : une adresse de copro dans la
 * signature du cabinet (son bureau) ne doit pas rattacher tous les mails (constat du 13/10).
 */
export function indicesNomAdresse(texte: string, copros: CoproTri[]): { reference: string; raison: string; approchee?: true }[] {
  const mots = new Set(normaliser(texte).split(/[^a-z0-9]+/).map(deplierVoie));
  const espace = ` ${normaliser(texte).replace(/[^a-z0-9]+/g, " ").trim()} `;
  const jetons = jetonsCompacts(texte);
  const numerosCites = new Set(jetons.map((t) => /^(\d{1,4})(?:bis|ter|b|t)?$/.exec(t)?.[1]).filter((n): n is string => n !== undefined).map((n) => String(Number(n))));
  const villes = villesDu(copros);
  const noyauTexte = ` ${noyauDe(texte).join(" ")} `;
  const parNom: { reference: string; raison: string }[] = [];
  const parAdresse: { reference: string; raison: string }[] = [];
  const approchees: { reference: string; raison: string; approchee: true }[] = [];
  const vues = new Set<string>();
  for (const c of copros) {
    const cle = cleDeReference(c.reference);
    if (!cle || vues.has(cle)) continue;
    const motsVille = new Set(motsSignificatifs(villeDe(c.adresse)));
    const exclus = (m: string) => motsVille.has(m) || villes.has(m);
    // Un nom ESTALE qui est une adresse (« 152 AVENUE GABRIEL PERI BEZONS ») n'est pas un nom
    // de residence : il passe par le controle d'adresse (lieu, numero), pas par le nom. Et un
    // nom de ville n'est distinctif pour aucune copro (audit du journal du tri, 19/10/2026).
    const distinctifs = nomEstAdresse(c.nom) ? [] : motsSignificatifs(c.nom).filter((m) => !exclus(m));
    const nomTrouve = (distinctifs.length >= 2
      ? distinctifs.every((m) => mots.has(m))
      : distinctifs.length === 1 && distinctifs[0]!.length >= 5 && mots.has(distinctifs[0]!))
      || nomCompacteCite(c.nom, jetons);
    // Sinon, un nom d'usage du registre national (« Le Clos Martin » pour LECLOS_BCD).
    const nomCite = nomTrouve ? c.nom : (c.nomsUsage ?? []).find((n) => nomUsageCite(n, exclus, mots, noyauTexte));
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
      if (!lieuPresent) continue;
      // Le numero doit suivre (audit du 19/10/2026) : « 152 avenue Gabriel Péri » ne designe pas
      // la copro du 25 de la meme avenue. Une adresse sans numero en base ne se controle pas.
      const numeros = numerosDe(adresse);
      const numeroCite = [...numeros].some((n) => numerosCites.has(n));
      const voie = voiesDe(adresse).find((v) => mots.has(v.type) && v.mots.every((m) => mots.has(m)));
      if (voie && (numeros.size === 0 || numeroCite)) {
        parAdresse.push({ reference: c.reference, raison: `Adresse « ${voie.type} ${voie.mots.join(" ")} » citée dans le mail, à confirmer.` });
        vues.add(cle);
        break;
      }
      // Une lettre d'ecart dans le nom de rue : seulement si le numero est cite (pas d'adresse
      // sans numero en base), en plus du lieu.
      const approchee = numeroCite ? voiesDe(adresse).find((v) => mots.has(v.type) && v.mots.every((m) => motDeRueCite(m, mots, true))) : undefined;
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
  return [...parNom, ...parAdresse, ...(parAdresse.length === 0 ? approchees.filter((a) => !exactes.has(a.reference)) : [])];
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
  /(?:\d{1,3}\s*,?\s*)?place\s+michelet(?:\s*,?\s*78800)?(?:\s*houilles)?/gi,
  /(?<![a-z])(?:siren|rcs|naf|carte\s+professionnelle|garantie\s+financi[eè]re).*?(?= {2,}|\x09|$)/gim,
];

/** Le texte sans les morceaux du papier a en-tete / de la signature du cabinet. */
export function retirerEnteteCabinet(texte: string): string {
  return ENTETE_CABINET.reduce((t, re) => t.replace(re, " "), texte);
}

/**
 * References de copro trouvees dans le texte d'une piece jointe (facture, bon d'intervention),
 * apres avoir retire le papier a en-tete du cabinet : d'abord les codes cites, puis
 * le nom d'immeuble / l'adresse du chantier (meme moteur que le mail). Toujours a confirmer.
 */
export function coprosDansPdf(texte: string, copros: CoproTri[]): string[] {
  const utile = retirerEnteteCabinet(texte);
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
  for (const i of indicesNomAdresse(utile, copros)) if (!refs.includes(i.reference)) refs.push(i.reference);
  return refs;
}

/**
 * Mail interne : envoyé depuis une adresse du cabinet (@real31.fr), hors la boîte partagée
 * elle-même. En pratique, un collègue a répondu à un client en laissant la boîte partagée en
 * copie ; le mail n'a plus d'utilité (avant on le gardait pour archiver sur Crypto). À corbeille.
 */
export function estMailInterne(deAdresse: string, boite: string): boolean {
  const de = deAdresse.trim().toLowerCase();
  return /@real31\.fr$/.test(de) && de !== boite.trim().toLowerCase();
}

/**
 * Pourquoi le tri propose la corbeille plutot qu'une copro. « publicite » : expediteur appris
 * du journal (expediteursPublicite).
 */
export type MotifCorbeille = "non-remis" | "reponse-auto" | "publicite";

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

/**
 * Avis de non-remise ou reponse automatique : le tri propose la corbeille au lieu d'une copro
 * (decision Sekou du 19/10/2026). Ce n'est qu'une proposition : rien n'est supprime sans clic.
 */
export function motifCorbeille(
  m: { deAdresse: string; objet: string },
  /** Expediteurs appris du journal (expediteursPublicite), en minuscules. */
  publicites?: ReadonlySet<string>,
): MotifCorbeille | null {
  const objet = normaliser(m.objet);
  if (EXPEDITEUR_NON_REMIS.test(m.deAdresse.trim()) || OBJET_NON_REMIS.test(objet)) return "non-remis";
  if (OBJET_REPONSE_AUTO.test(objet)) return "reponse-auto";
  if (publicites?.has(cleExpediteur(m.deAdresse))) return "publicite";
  return null;
}

/** La suggestion d'un mail a mettre a la corbeille : aucune copro, la raison le dit. */
export function suggestionCorbeille(motif: MotifCorbeille): Suggestion {
  return {
    nature: "aucune",
    candidats: [],
    raison:
      motif === "non-remis"
        ? "Avis de non-remise d'un mail envoyé : proposé à la corbeille."
        : motif === "reponse-auto"
          ? "Réponse automatique (absence, accusé de réception) : proposée à la corbeille."
          : "Expéditeur déjà mis à la corbeille au moins deux fois, jamais rangé : proposé à la corbeille.",
  };
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
    if (!cle || /@real31\.fr$/.test(cle)) continue;
    const c = compte.get(cle) ?? { corbeille: 0, range: false };
    if (e.coproReference || e.copros.length > 0 || e.dossierCle?.startsWith("binome:")) c.range = true;
    else if (e.dossierCle === DOSSIER_CORBEILLE && !motifCorbeille({ deAdresse: e.expediteur, objet: e.objet })) c.corbeille++;
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
  return plafonnerInactives(suggestionBrute(mail, ref), ref);
}

/**
 * Copros inactives (mandat termine) : au plus une piste faible, et apres les copros actives.
 * Elles restent reconnues : l'ancien syndic, un coproprietaire ou un locataire ecrit encore.
 */
function plafonnerInactives(s: Suggestion, ref: ReferentielTri): Suggestion {
  const inactives = new Set(ref.copros.filter((c) => c.inactive).map((c) => c.reference));
  if (!s.candidats.some((r) => inactives.has(r))) return s;
  const candidats = [...s.candidats.filter((r) => !inactives.has(r)), ...s.candidats.filter((r) => inactives.has(r))];
  if (s.nature === "sure") return { nature: "faible", candidats, raison: `${s.raison} Copropriété inactive : à confirmer.` };
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
    return { nature: "sure", candidats: immats, raison: `Numéro d'immatriculation de ${immats[0]} cité.` };
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
    return { nature: "sure", candidats: [c.reference], raison: `Code ${c.reference} cité dans l'objet.` };
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
    };
  }

  // 4. Nom de l'immeuble ou adresse cite (prestataires : « LE CYRANO », « 71 rue de Bezons »).
  // Indice faible, mais sur UNE copro il est range sans clic sur syndic4 (origine
  // « nom-adresse », decision du 26/10/2026 ; plusieurs copros : a choisir). On ne lit que
  // l'objet et le DEBUT du corps : l'adresse du cabinet, en signature de bas de mail, ne
  // doit pas rattacher tous les mails (constat du 13/10/2026).
  const indices = indicesNomAdresse(`${mail.objet}\n${corps.slice(0, TETE_CORPS)}`, ref.copros);
  if (indices.length === 1) {
    // Un code hors perimetre cite a cote (« S0142 », copro d'une autre agence) : la piste reste
    // a confirmer, elle ne porte pas l'origine qui la rend rangeable sans clic.
    const codeHorsPerimetre = new RegExp(MOTIF_REFERENCE.source, "i").test(`${mail.objet}\n${corps}`);
    // Une adresse a une lettre pres reste aussi a confirmer (decision Sekou du 27/10/2026) :
    // elle n'etait pas dans la mesure des 15 faibles justes, on l'observe d'abord.
    return {
      nature: "faible",
      candidats: [indices[0]!.reference],
      raison: indices[0]!.raison,
      ...(codeHorsPerimetre || indices[0]!.approchee ? {} : { origine: "nom-adresse" as const }),
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

/** Les deux dossiers hors binome (arbitrage du 30/09/2026). */
export const DOSSIERS_HORS_BINOME = {
  comptabilite: "Comptabilité",
  divers: "Divers",
} as const;
export type DossierHorsBinome = keyof typeof DOSSIERS_HORS_BINOME;

/**
 * Ce qu'un collaborateur choisit pour un mail :
 * - une copro : le dossier de son binome, etiquete a son code ;
 * - un dossier de binome choisi librement, avec zero, une ou plusieurs etiquettes (une
 *   invitation d'un prestataire, des factures pour plusieurs copros : demande du 08/10) ;
 * - Comptabilité ou Divers.
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
 * partagees (Sandy : Galiano et Julie, arbitrage du 08/10/2026).
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
 * Le binome d'une copro : celui qui lui est affecte, sinon le principal de son gestionnaire.
 * Une affectation qui pointe le binome d'un AUTRE gestionnaire (le mandat a change dans
 * ESTALE) est ignoree.
 */
export function binomeDeCopro(copro: CoproTri, b: BinomesTri): Binome | null {
  if (!copro.gestionnaire) return null;
  const g = minuscules(copro.gestionnaire.email);
  const affecte = b.parCopro[copro.reference];
  const parAffectation = affecte ? b.binomes.find((x) => x.id === affecte && x.gestionnaireEmail === g) : undefined;
  return parAffectation ?? b.binomes.find((x) => x.gestionnaireEmail === g && x.principal) ?? null;
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
}

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
  /** Ses copros ESTALE ; `binomeId` = affectation explicite (null : le principal). */
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
            const id = b.parCopro[c.reference];
            return { reference: c.reference, nom: c.nom, binomeId: id && siens.some((x) => x.id === id) ? id : null };
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
 * La seule boite rangee automatiquement (decision Sekou du 20/10/2026, mesure : 16 pistes
 * sures sur 16 justes depuis les correctifs du 19/10). Une autre boite = une autre decision,
 * donc un changement de code, pas un reglage d'environnement.
 */
export const BOITE_TRI_AUTOMATIQUE = "syndic4@real31.fr";

/** Pourquoi un mail de la file n'est pas range automatiquement (bilan de la tache planifiee). */
export type RefusAutomatique =
  | "autre-boite"
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

/**
 * La piste du mail suffit-elle a ranger sans clic ? Une piste « sure » (hors historique de la
 * conversation), ou, depuis le 26/10/2026 (mesure : 15 faibles mono-candidat sur 15 justes),
 * une piste « faible » trouvee par le nom de l'immeuble ou son adresse (origine
 * « nom-adresse »). Toujours sur UNE seule copro.
 */
export function pisteRangeable(s: Suggestion): boolean {
  if (s.candidats.length !== 1) return false;
  if (s.nature === "sure") return s.origine !== "conversation";
  return s.nature === "faible" && s.origine === "nom-adresse";
}

/**
 * Ce mail de la file peut-il etre range SANS clic (ADR-046 : « un clic d'abord, puis de
 * l'automatique signal par signal ») ? Seulement si TOUT est reuni :
 *   - la boite est syndic4 (BOITE_TRI_AUTOMATIQUE) ;
 *   - ni corbeille proposee (non remis, reponse automatique) ni mail interne ;
 *   - piste rangeable (pisteRangeable), sur UNE seule copro : « sure », ou « faible » par le
 *     nom de l'immeuble ou son adresse. Pas « plusieurs », pas un code dans le corps, pas un
 *     fournisseur seul, pas l'historique de la conversation ;
 *   - le mail n'est jamais passe par le journal : ni range, ni range puis annule (quelqu'un
 *     l'a remis dans la file : il veut decider lui-meme) ;
 *   - la copro est dans le referentiel, active (deja plafonnee a « faible » par
 *     suggererCopro : on reverifie) et son dossier de binome est connu (gestionnaire au
 *     mandat et initiales).
 * Pure : le service fournit le referentiel et le journal.
 */
export function rangeableAutomatiquement(
  mail: Pick<MailATrier, "corbeille" | "interne"> & { suggestion: Suggestion },
  ctx: {
    boite: string;
    /** Le mail a au moins une ligne de journal, annulee ou non. */
    dejaPasse: boolean;
    copros: CoproTri[];
    initialesParEmail: Record<string, string>;
    binomes?: BinomesTri;
  },
): { ok: true; reference: string } | { ok: false; motif: RefusAutomatique } {
  if (ctx.boite.trim().toLowerCase() !== BOITE_TRI_AUTOMATIQUE) return { ok: false, motif: "autre-boite" };
  if (mail.corbeille) return { ok: false, motif: "corbeille" };
  if (mail.interne) return { ok: false, motif: "interne" };
  const s = mail.suggestion;
  if (!pisteRangeable(s)) return { ok: false, motif: "pas-sure" };
  if (ctx.dejaPasse) return { ok: false, motif: "deja-passe" };
  return coproRangeable(s.candidats[0]!, ctx);
}

type ContexteAutomatique = Parameters<typeof rangeableAutomatiquement>[1];
type DecisionAutomatique = ReturnType<typeof rangeableAutomatiquement>;

/** La copro existe, est active et son dossier de binome est connu. */
function coproRangeable(reference: string, ctx: ContexteAutomatique): DecisionAutomatique {
  const copro = ctx.copros.find((c) => c.reference === reference);
  if (!copro) return { ok: false, motif: "copro-inconnue" };
  if (copro.inactive) return { ok: false, motif: "copro-inactive" };
  if (!destinationDe(copro, ctx.initialesParEmail, ctx.binomes)?.nomDossier) return { ok: false, motif: "sans-destination" };
  return { ok: true, reference: copro.reference };
}

/**
 * Faut-il lire les PDF de ce mail dans la tache planifiee (decision Sekou du 26/10/2026) ?
 * Seulement un mail refuse faute de piste rangeable (« pas-sure » : les autres refus,
 * corbeille, interne, autre boite, ne changeront pas), jamais passe par le journal, avec des
 * pieces jointes, et qui ne cite pas un code hors perimetre (il parle d'une autre agence).
 */
export function aLirePiecesJointes(
  mail: Pick<MailATrier, "aPiecesJointes"> & { suggestion: Suggestion },
  decision: DecisionAutomatique,
  dejaPasse: boolean,
): boolean {
  return !decision.ok && decision.motif === "pas-sure" && mail.aPiecesJointes && !dejaPasse && mail.suggestion.nature !== "hors-estale";
}

/**
 * Le mail peut-il etre range SANS clic sur la foi de ses PDF ? Memes garde-fous que
 * rangeableAutomatiquement (syndic4, ni corbeille ni interne, jamais passe par le journal,
 * copro active au dossier connu), et :
 *   - les PDF du mail, TOUS lus, designent UNE seule copro (`pdf` : leur union) ;
 *   - si le mail lui-meme propose des copros (« plusieurs », fournisseur, code dans le corps),
 *     celle du PDF doit en faire partie : deux indices qui se contredisent, c'est un humain
 *     qui tranche.
 */
export function rangeableParPiecesJointes(
  mail: Pick<MailATrier, "corbeille" | "interne"> & { suggestion: Suggestion },
  pdf: string[],
  ctx: ContexteAutomatique,
): DecisionAutomatique {
  if (ctx.boite.trim().toLowerCase() !== BOITE_TRI_AUTOMATIQUE) return { ok: false, motif: "autre-boite" };
  if (mail.corbeille) return { ok: false, motif: "corbeille" };
  if (mail.interne) return { ok: false, motif: "interne" };
  if (ctx.dejaPasse) return { ok: false, motif: "deja-passe" };
  if (mail.suggestion.nature === "hors-estale") return { ok: false, motif: "pas-sure" };
  if (pdf.length === 0) return { ok: false, motif: "pj-aucune" };
  if (pdf.length > 1) return { ok: false, motif: "pj-plusieurs" };
  const candidats = mail.suggestion.candidats;
  if (candidats.length > 0 && !candidats.includes(pdf[0]!)) return { ok: false, motif: "pj-conflit" };
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
  /** Ce qu'on lit dans la liste, ex "SC-GG · Sandy CARRIER avec Galiano GUAETTA". */
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
