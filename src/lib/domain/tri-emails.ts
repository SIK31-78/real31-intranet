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
        ? { ...deja, gestionnaire: deja.gestionnaire ?? c.gestionnaire, assistant: deja.assistant ?? c.assistant, adresse: deja.adresse || c.adresse }
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

function normaliser(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Mots porteurs de sens d'un libelle (>= 4 lettres, ni banals ni purement numeriques). */
function motsSignificatifs(s: string): string[] {
  return [...new Set(normaliser(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !MOTS_BANALS.has(t) && !/^\d+$/.test(t)))];
}

// L'adresse d'une CoproTri est "voie code_postal ville" concatenee. La voie = avant le code
// postal, numero de rue retire : "3 place michelet 95100 Chatou" -> "place michelet".
function voieDe(adresse: string): string {
  const avantCP = normaliser(adresse).split(/\b\d{5}\b/)[0] ?? "";
  return avantCP.replace(/^\s*\d+\s*(bis|ter|quater)?\s*/, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
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
  const out: { reference: string; raison: string }[] = [];
  const vues = new Set<string>();
  for (const c of copros) {
    const cle = cleDeReference(c.reference);
    if (!cle || vues.has(cle)) continue;
    const ville = villeDe(c.adresse);
    const motsVille = new Set(motsSignificatifs(ville));
    const distinctifs = motsSignificatifs(c.nom).filter((m) => !motsVille.has(m));
    const parNom = distinctifs.length >= 2
      ? distinctifs.every((m) => mots.has(m))
      : distinctifs.length === 1 && distinctifs[0]!.length >= 5 && mots.has(distinctifs[0]!);
    if (parNom) {
      out.push({ reference: c.reference, raison: `Immeuble « ${c.nom} » cité dans le mail, à confirmer.` });
      vues.add(cle);
      continue;
    }
    const voie = voieDe(c.adresse);
    const cp = codePostalDe(c.adresse);
    const lieuPresent = (cp !== "" && mots.has(cp)) || (ville.length >= 4 && espace.includes(` ${ville} `));
    if (voie.length >= 10 && espace.includes(` ${voie} `) && lieuPresent) {
      out.push({ reference: c.reference, raison: `Adresse « ${voie} » citée dans le mail, à confirmer.` });
      vues.add(cle);
    }
  }
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
 */
export function suggererCopro(
  mail: Pick<MailATrier, "deAdresse" | "objet" | "apercu">,
  ref: ReferentielTri,
): Suggestion {
  const parCle = new Map<string, CoproTri>();
  for (const c of ref.copros) {
    const cle = cleDeReference(c.reference);
    if (cle) parCle.set(cle, c);
  }

  // 1. Code dans l'objet (le plus fiable : c'est souvent une reponse a nos propres mails).
  const dansObjet = referencesCitees(mail.objet);
  const objetEstale = dansObjet.map((k) => parCle.get(k)).filter((c): c is CoproTri => Boolean(c));
  if (objetEstale.length === 1) {
    const c = objetEstale[0]!;
    return { nature: "sure", candidats: [c.reference], raison: `Code ${c.reference} cité dans l'objet.` };
  }
  if (objetEstale.length > 1) {
    return {
      nature: "plusieurs",
      candidats: objetEstale.map((c) => c.reference),
      raison: "Plusieurs codes de copropriété cités dans l'objet.",
    };
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
  const dansCorps = referencesCitees(mail.apercu);
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
  const indices = indicesNomAdresse(`${mail.objet}\n${mail.apercu.slice(0, TETE_CORPS)}`, ref.copros);
  if (indices.length === 1) {
    return { nature: "faible", candidats: [indices[0]!.reference], raison: indices[0]!.raison };
  }
  if (indices.length > 1) {
    return { nature: "plusieurs", candidats: indices.map((i) => i.reference), raison: "Plusieurs copropriétés citées par leur nom ou adresse, à confirmer." };
  }

  // Un code est cite mais aucune copro du perimetre ne le porte : hors perimetre. On affiche
  // le code tel qu'il est ecrit dans le mail ("S0142"), pas sa cle de comparaison.
  const premier = new RegExp(MOTIF_REFERENCE.source, "i").exec(`${mail.objet}
${mail.apercu}`);
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
