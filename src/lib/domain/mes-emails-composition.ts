// Composition d'un mail SORTANT depuis une boîte partagée (syndicN), façon « F1 » de Crypto :
// on choisit un copropriétaire -> sa copro donne le code, le nom et l'adresse, qui tag­uent
// l'objet (« S247 · Résidence X · 12 rue … ») pour que le mail soit retrouvable par le tri.
// Modèles d'événement = gabarits simples {{variable}}. Domaine PUR : aucune dépendance,
// aucun réseau -> testable tel quel. L'envoi réel vit ailleurs (gaté par envoiMailActif()).

/** Un contact d'une copro (copropriétaire, conseil syndical, locataire, pro…), issu de l'annuaire. */
export interface ContactCopro {
  email: string;
  /** Nom affiché ("" si l'annuaire ne l'a pas). */
  nom: string;
  /** coproprietaire | conseil_syndical | locataire | professionnel | autre. */
  qualite: string;
  metier?: string;
}

/** La copro telle qu'on en a besoin pour composer (sous-ensemble de CoproTri). */
export interface CoproComposition {
  reference: string;
  nom: string;
  /** Adresse sur une ligne, "" si inconnue. */
  adresse: string;
}

/** Une copro proposée dans le compositeur : la copro + son gestionnaire (pour affichage). */
export interface CoproChoisissable extends CoproComposition {
  gestionnaire: string | null;
}

/**
 * Préfixe d'objet qui identifie la copro : CODE · Nom [· Adresse]. Le CODE en tête fait que
 * le tri reconnaît le mail à coup sûr (suggererCopro, « code dans l'objet »). On tronque une
 * adresse trop longue pour garder un objet lisible.
 */
export function prefixeObjetCopro(copro: CoproComposition, avecAdresse = true): string {
  const adresse = copro.adresse.trim();
  // Beaucoup de copros portent leur adresse comme nom (« 44/50 rue Gabriel Péri ») : on ne
  // la répète pas. L'adresse complète (avec la ville) l'emporte sur le nom qu'elle contient.
  const nom = avecAdresse && adresse && sansAccents(adresse).includes(sansAccents(copro.nom)) ? "" : copro.nom.trim();
  const bouts = [copro.reference, nom];
  // Adresse complète, jamais tronquée : ce préfixe part tel quel dans l'objet du mail.
  if (avecAdresse && adresse) bouts.push(adresse);
  return bouts.filter(Boolean).join(" · ");
}

const sansAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Une personne de l'annuaire (fiche Crypto) : TOUTES ses adresses (certains en ont deux et
 * veulent les deux en destinataires, Crypto les note « a@x.fr;b@y.fr ») et ses copros.
 */
export interface DestinataireTrouve {
  cle: string;
  nom: string;
  /** La casquette Crypto (« Entrep. Plomberie », « Notaire ») ou la qualité (copropriétaire…). */
  casquette: string;
  emails: string[];
  copros: (CoproChoisissable & { qualite: string })[];
}

/** Une ligne d'annuaire rendue par la recherche, avant enrichissement des copros. */
export interface IdentiteAnnuaire {
  cle: string;
  nom: string;
  /** Casquette Crypto (métier) quand la fiche en a une. */
  metier?: string;
  emails: string[];
  /** Référence affichée (ESTALE sinon Crypto) et qualité dans cette copro. */
  copros: { reference: string; qualite: string }[];
}

/**
 * Une adresse que l'envoi acceptera : la même règle que la validation serveur (celle de zod),
 * pour que le compositeur refuse à la saisie ce que le serveur refuserait à l'envoi. Pas
 * d'accent : « mylène.pin@… » passait à la saisie puis bloquait l'envoi sans dire pourquoi
 * (Nicolas, 15/10/2026).
 */
export const ADRESSE_MAIL = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

export const adresseMailValide = (e: string): boolean => e.length <= 320 && ADRESSE_MAIL.test(e);

/** Objet complet d'un mail à une copro : le préfixe identifiant, puis le sujet saisi. */
export function objetCompose(copro: CoproComposition, sujet: string, avecAdresse = true): string {
  const prefixe = prefixeObjetCopro(copro, avecAdresse);
  const s = sujet.trim();
  return s ? `${prefixe} - ${s}` : prefixe;
}

/** Variables de fusion offertes aux modèles. Toutes facultatives : une variable absente devient "". */
export interface VariablesModele {
  copro_code?: string;
  copro_nom?: string;
  copro_adresse?: string;
  destinataire_nom?: string;
  gestionnaire_nom?: string;
  gestionnaire_initiales?: string;
  agence?: string;
  date?: string;
}

/**
 * Fusionne un gabarit {{variable}} avec les variables fournies. Une variable connue mais vide
 * est remplacée par "" ; une variable INCONNUE est laissée visible « [cle] » pour que le
 * collaborateur la complète (jamais de {{...}} résiduel envoyé par mégarde).
 */
export function fusionnerModele(gabarit: string, variables: VariablesModele): string {
  return gabarit.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, cle: string) => {
    const k = cle.toLowerCase() as keyof VariablesModele;
    if (k in MODELE_CLES) return variables[k] ?? "";
    return `[${cle}]`;
  });
}

// Clés reconnues (pour distinguer variable vide d'une variable inconnue).
export const MODELE_CLES: Record<keyof VariablesModele, true> = {
  copro_code: true, copro_nom: true, copro_adresse: true, destinataire_nom: true,
  gestionnaire_nom: true, gestionnaire_initiales: true, agence: true, date: true,
};

// Formule de politesse finale d'un modèle (une ligne seule, en fin de texte).
const FORMULE_FIN = /^(?:bien\s+)?cordialement[\s,.!]*$|^bien\s+à\s+vous[\s,.!]*$|^(?:sincères|meilleures|bien\s+sincères)\s+salutations[\s,.!]*$/i;
// Une signature qui porte déjà une formule de politesse (certaines signatures Signitic).
const FORMULE_DANS_SIGNATURE = /cordialement|bien\s+à\s+vous|salutations/i;

/**
 * Retire le « Cordialement » final d'un modèle quand la signature de la personne en contient
 * déjà un : sinon le mail en porterait deux. Point encore à trancher en interne (15/10/2026) ;
 * d'ici là, la signature gagne. `signature` = HTML ou texte de la signature Signitic.
 */
export function sansPolitesseEnDouble(corps: string, signature: string | null | undefined): string {
  const texteSignature = (signature ?? "").replace(/<[^>]+>/g, " ");
  if (!FORMULE_DANS_SIGNATURE.test(texteSignature)) return corps;
  const lignes = corps.replace(/\s+$/, "").split("\n");
  if (!FORMULE_FIN.test((lignes.at(-1) ?? "").trim())) return corps;
  return lignes.slice(0, -1).join("\n").replace(/\s+$/, "") + "\n";
}

/** Un modèle d'événement (gabarit de mail réutilisable). */
export interface ModeleMail {
  id: string;
  titre: string;
  /** Sujet du mail (hors préfixe copro, qui est ajouté automatiquement). */
  sujet: string;
  /** Corps en texte, avec variables {{...}}. */
  corps: string;
}

/**
 * Modèles de départ (seed), simples et génériques. Les vrais « modèles d'événement » de
 * Crypto seront extraits plus tard (le tri d'abord) ; ceux-ci servent à dérouler le parcours.
 */
export const MODELES_MAIL: ModeleMail[] = [
  {
    id: "info-copro",
    titre: "Information à la copropriété",
    sujet: "Information",
    corps:
      "Bonjour,\n\nNous vous informons que …\n\nNous restons à votre disposition.\n\nCordialement,\n{{gestionnaire_nom}}\nREAL 31 - {{agence}}",
  },
  {
    id: "demande-devis",
    titre: "Demande de devis à un prestataire",
    sujet: "Demande de devis",
    corps:
      "Bonjour,\n\nPour la copropriété {{copro_nom}} ({{copro_code}}), {{copro_adresse}}, nous souhaitons recevoir un devis pour …\n\nMerci de nous le retourner à cette adresse.\n\nCordialement,\n{{gestionnaire_nom}}",
  },
  {
    id: "relance-cs",
    titre: "Relance du conseil syndical",
    sujet: "Relance",
    corps:
      "Bonjour,\n\nSauf erreur de notre part, nous sommes toujours en attente de votre retour concernant …\n\nPourriez-vous nous le faire parvenir ? Nous vous en remercions.\n\nCordialement,\n{{gestionnaire_nom}}",
  },
  {
    id: "accuse-reception",
    titre: "Accusé de réception",
    sujet: "Bien reçu",
    corps:
      "Bonjour {{destinataire_nom}},\n\nNous accusons réception de votre message et revenons vers vous dans les meilleurs délais.\n\nCordialement,\n{{gestionnaire_nom}}",
  },
];

// ─── Transmission d'une facture au robot ESTALE ───────────────────────────────────────────
// Format métier observé (envoi manuel actuel) : « 601000 - DGP NETTOYAGE - Entretien EV ».
// On le reproduit à l'identique dans l'objet ; le robot lit l'objet + la PJ (la facture).

export interface FactureEstale {
  /** Numéro de compte comptable, ex "601000". */
  compte: string;
  /** Nom du fournisseur, ex "DGP NETTOYAGE". */
  fournisseur: string;
  /** Libellé de la charge, ex "Entretien EV". */
  libelle: string;
}

/** La facture est-elle prête à transmettre (les trois champs remplis) ? */
export function factureComplete(f: Partial<FactureEstale>): f is FactureEstale {
  return Boolean(f.compte?.trim() && f.fournisseur?.trim() && f.libelle?.trim());
}

/** Objet codifié transmis au robot facture ESTALE : « COMPTE - FOURNISSEUR - LIBELLÉ ». */
export function objetFactureEstale(f: FactureEstale): string {
  return `${f.compte.trim()} - ${f.fournisseur.trim().toUpperCase()} - ${f.libelle.trim()}`;
}
