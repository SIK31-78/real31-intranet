// Tri des e-mails V2 (ADR-043) : l'intranet lit la boite de reception d'une boite
// partagee generique et PROPOSE une copropriete ESTALE pour chaque mail ; au clic, le
// mail part dans le sous-dossier du gestionnaire (increment 2). On repond dans Outlook.
// Domaine pur : aucune lecture d'env, aucun appel reseau -> testable tel quel.
//
// Perimetre : uniquement les coproprietes ESTALE (decision Sekou du 25/09/2026). Un mail
// qui cite une copro absente d'ESTALE est signale "hors ESTALE", jamais rattache.

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
}

/** Pourquoi une adresse e-mail est connue d'une copro dans ESTALE. */
export type QualiteExpediteur = "copropriétaire" | "conseil syndical" | "fournisseur";

export interface LienExpediteur {
  reference: string;
  qualite: QualiteExpediteur;
}

/** Le referentiel ESTALE du tri : les copros et l'index adresse -> copros. */
export interface ReferentielTri {
  copros: CoproTri[];
  /** Cle = adresse e-mail en minuscules. */
  expediteurs: Record<string, LienExpediteur[]>;
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

const LIBELLE_QUALITE: Record<QualiteExpediteur, string> = {
  "copropriétaire": "copropriétaire",
  "conseil syndical": "membre du conseil syndical",
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

  // 2. Expediteur connu d'ESTALE.
  const liens = ref.expediteurs[mail.deAdresse.trim().toLowerCase()] ?? [];
  const references = [...new Set(liens.map((l) => l.reference))];
  if (references.length === 1) {
    const qualite = LIBELLE_QUALITE[liens[0]!.qualite];
    return {
      nature: "sure",
      candidats: references,
      raison: `Adresse connue dans ESTALE : ${qualite} de ${references[0]}.`,
    };
  }
  if (references.length > 1) {
    const qualites = [...new Set(liens.map((l) => LIBELLE_QUALITE[l.qualite]))].join(", ");
    return {
      nature: "plusieurs",
      candidats: references,
      raison: `Adresse connue dans ESTALE sur ${references.length} copropriétés (${qualites}).`,
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

  // Un code est cite mais aucune copro ESTALE ne le porte : hors perimetre. On affiche
  // le code tel qu'il est ecrit dans le mail ("S0142"), pas sa cle de comparaison.
  const premier = new RegExp(MOTIF_REFERENCE.source, "i").exec(`${mail.objet}
${mail.apercu}`);
  if (premier) {
    return {
      nature: "hors-estale",
      candidats: [],
      raison: `Code ${premier[0].toUpperCase()} cité, mais cette copropriété n'est pas sur ESTALE.`,
    };
  }

  return { nature: "aucune", candidats: [], raison: "Adresse inconnue dans ESTALE et aucun code de copropriété dans le mail." };
}

/** Ou part le mail quand on l'attribue (option A : un dossier par gestionnaire). */
export interface Destination {
  gestionnaire: MembreTri;
  /** Initiales du gestionnaire (table User de l'intranet). null = inconnues : on ne peut pas ranger. */
  initiales: string | null;
  /** Chemin affiche, ex "Boîte de réception › SK". */
  dossier: string | null;
  assistant: MembreTri | null;
}

/**
 * Destination d'un mail rattache a une copro. Les initiales viennent de l'intranet et
 * non d'ESTALE : le nom complet ESTALE ne donne souvent qu'un prenom (constat du 25/09).
 */
export function destinationDe(
  copro: CoproTri,
  initialesParEmail: Record<string, string>,
): Destination | null {
  if (!copro.gestionnaire) return null;
  const initiales = initialesParEmail[copro.gestionnaire.email.trim().toLowerCase()]?.trim() || null;
  return {
    gestionnaire: copro.gestionnaire,
    initiales,
    dossier: initiales ? `Boîte de réception › ${initiales}` : null,
    assistant: copro.assistant,
  };
}

/** Intitule ESTALE d'un assistant de copropriete (pas "Assistante commerciale", pas "Assistant comptable"). */
export function estAssistantDeCopro(intitule: string | null | undefined): boolean {
  return /\bassistant(e)?\s+de\s+copro/i.test(intitule ?? "");
}
