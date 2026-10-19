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
        ? { ...deja, gestionnaire: deja.gestionnaire ?? c.gestionnaire, assistant: deja.assistant ?? c.assistant, adresse: deja.adresse || c.adresse, immatriculation: deja.immatriculation ?? c.immatriculation }
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
}

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
      const n = seg.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
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

function codePostalDe(adresse: string): string {
  return /\b(\d{5})\b/.exec(adresse)?.[1] ?? "";
}

/**
 * Copros dont le NOM d'immeuble ou l'ADRESSE est cite dans le texte (objet + apercu). Indice
 * faible, a confirmer : les prestataires ecrivent « LE CYRANO » ou « 71 rue de Bezons »
 * plutot que le code. Deux garde-fous contre les faux positifs :
 *   - du nom, on retire les mots de la ville de la copro ; il faut >= 2 mots distinctifs
 *     presents, ou un seul d'au moins 5 lettres ;
 *   - une adresse ne compte que si la voie (type de voie inclus) fait >= 10 caracteres,
 *     apparait telle quelle, ET que le code postal ou la ville de la copro apparait aussi
 *     (« 71 rue de Bezons » a Carrieres ne matche pas un mail de Bezons). On rend au plus
 *     une raison par copro, le nom primant.
 * L'appelant ne passe ici que l'objet et le DEBUT du corps : une adresse de copro dans la
 * signature du cabinet (son bureau) ne doit pas rattacher tous les mails (constat du 13/10).
 */
export function indicesNomAdresse(texte: string, copros: CoproTri[]): { reference: string; raison: string }[] {
  const mots = new Set(normaliser(texte).split(/[^a-z0-9]+/));
  const espace = ` ${normaliser(texte).replace(/[^a-z0-9]+/g, " ").trim()} `;
  const parNom: { reference: string; raison: string }[] = [];
  const parAdresse: { reference: string; raison: string }[] = [];
  const vues = new Set<string>();
  for (const c of copros) {
    const cle = cleDeReference(c.reference);
    if (!cle || vues.has(cle)) continue;
    const ville = villeDe(c.adresse);
    const motsVille = new Set(motsSignificatifs(ville));
    const distinctifs = motsSignificatifs(c.nom).filter((m) => !motsVille.has(m));
    const nomTrouve = distinctifs.length >= 2
      ? distinctifs.every((m) => mots.has(m))
      : distinctifs.length === 1 && distinctifs[0]!.length >= 5 && mots.has(distinctifs[0]!);
    if (nomTrouve) {
      parNom.push({ reference: c.reference, raison: `Immeuble « ${c.nom} » cité dans le mail, à confirmer.` });
      vues.add(cle);
      continue;
    }
    const cp = codePostalDe(c.adresse);
    const lieuPresent = (cp !== "" && mots.has(cp)) || (ville.length >= 4 && espace.includes(` ${ville} `));
    // Une rue compte si son type (rue, avenue…) ET tous ses mots porteurs sont cités, ET que
    // le lieu (code postal ou ville) l'est aussi : « 71 rue de Bezons » à Carrières ne matche
    // pas un mail de Bezons 95870.
    const voie = lieuPresent ? voiesDe(c.adresse).find((v) => mots.has(v.type) && v.mots.every((m) => mots.has(m))) : undefined;
    if (voie) {
      parAdresse.push({ reference: c.reference, raison: `Adresse « ${voie.type} ${voie.mots.join(" ")} » citée dans le mail, à confirmer.` });
      vues.add(cle);
    }
  }
  // Le nom d'immeuble prime : s'il y a un « LE PLAZZA », on ne noie pas la suggestion sous
  // les copros qui ne partagent que la rue (constat du 13/10/2026 : départage souvent evident).
  return parNom.length > 0 ? parNom : parAdresse;
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

// Lignes du papier a en-tete du cabinet (son adresse, SIREN…) : a ignorer dans une piece
// jointe, sinon toute facture rattache le mail a la copro ou siege l'agence (place Michelet).
// Mesure du 13/10/2026 : sans ce filtre, 24 PDF sur 35 remontaient « place Michelet ».
const LIGNE_ENTETE_CABINET = /real\s*31|place\s+michelet|\bsiren\b|\brcs\b|\bnaf\b|carte\s+professionnelle|garantie\s+financiere/i;

/**
 * References de copro trouvees dans le texte d'une piece jointe (facture, bon d'intervention),
 * apres avoir retire les lignes du papier a en-tete du cabinet : d'abord les codes cites, puis
 * le nom d'immeuble / l'adresse du chantier (meme moteur que le mail). Toujours a confirmer.
 */
export function coprosDansPdf(texte: string, copros: CoproTri[]): string[] {
  const utile = texte.split(/\r?\n/).filter((l) => !LIGNE_ENTETE_CABINET.test(normaliser(l))).join("\n");
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
 */
export function suggererCopro(
  mail: Pick<MailATrier, "deAdresse" | "objet" | "apercu"> & {
    /** Le corps entier, historique cite compris, pour « Immeuble concerné » ; a defaut, l'apercu. */
    corps?: string;
  },
  ref: ReferentielTri,
): Suggestion {
  const parCle = new Map<string, CoproTri>();
  for (const c of ref.copros) {
    const cle = cleDeReference(c.reference);
    if (cle) parCle.set(cle, c);
  }
  const corps = nettoyerCorps(mail.apercu);

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
  const immeuble = coprosImmeubleConcerne(mail.corps === undefined ? corps : nettoyerCorps(mail.corps), ref.copros);

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

  // 2. Expediteur connu d'ESTALE ou de l'annuaire Crypto.
  const liens = ref.expediteurs[mail.deAdresse.trim().toLowerCase()] ?? [];
  const references = [...new Set(liens.map((l) => l.reference))];
  const ou = [...new Set(liens.map((l) => (l.source === "crypto" ? "Crypto" : "ESTALE")))].join(" et ");
  if (references.length === 1) {
    const qualite = LIBELLE_QUALITE[liens[0]!.qualite];
    return {
      nature: "sure",
      candidats: references,
      raison: `Adresse connue dans ${ou} : ${qualite} de ${references[0]}.`,
    };
  }
  if (references.length > 1) {
    const qualites = [...new Set(liens.map((l) => LIBELLE_QUALITE[l.qualite]))].join(", ");
    return {
      nature: "plusieurs",
      candidats: references,
      raison: `Adresse connue dans ${ou} sur ${references.length} copropriétés (${qualites}).`,
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
  // Indice faible : a confirmer au clic, rien ne bouge sans decision humaine. On ne lit que
  // l'objet et le DEBUT du corps : l'adresse du cabinet, en signature de bas de mail, ne
  // doit pas rattacher tous les mails (constat du 13/10/2026).
  const indices = indicesNomAdresse(`${mail.objet}\n${corps.slice(0, TETE_CORPS)}`, ref.copros);
  if (indices.length === 1) {
    return { nature: "faible", candidats: [indices[0]!.reference], raison: indices[0]!.raison };
  }
  if (indices.length > 1) {
    return { nature: "plusieurs", candidats: indices.map((i) => i.reference), raison: "Plusieurs copropriétés citées par leur nom ou adresse, à confirmer." };
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
  signal: NatureSuggestion | null;
  candidats: string[];
  /** true = rangement simule (ecriture Graph coupee) : le mail n'a pas bouge. */
  simulation: boolean;
  par: string;
  faitLe: string;
  annuleLe: string | null;
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
  const candidates = copros.filter((c) => destinationDe(c, initialesParEmail, b)?.cle === cle);
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
