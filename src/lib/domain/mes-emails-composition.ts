// Composition d'un mail SORTANT depuis une boîte partagée (syndicN), façon « F1 » de Crypto :
// on choisit un copropriétaire -> sa copro donne le code et le nom, qui taguent l'objet
// (« S247 · Résidence X ») pour que le mail soit retrouvable par le tri.
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
  /**
   * La personne derrière l'adresse (REA-356) : « crypto:<tiers_id> » (fiche Crypto, ses
   * correspondants compris) ou « estale:<owner id> ». Sert à compter les copropriétaires
   * d'un envoi à toute la copropriété ; absent quand la source ne le dit pas.
   */
  personne?: string;
}

/** Un copropriétaire ESTALE actif qui accepte le mail (REA-356). */
export interface CoproprietaireJoignable {
  id: string;
  nom: string;
  email: string;
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

/**
 * Objet complet d'un mail à une copro : le préfixe identifiant, puis le sujet saisi. Sans
 * l'adresse par défaut (REA-408) : « CODE · Nom », comme l'objet d'une réponse
 * (sujetDeReponse) ; le code suffit au tri, l'adresse alourdissait l'objet.
 */
export function objetCompose(copro: CoproComposition, sujet: string, avecAdresse = false): string {
  const prefixe = prefixeObjetCopro(copro, avecAdresse);
  const s = sujet.trim();
  return s ? `${prefixe} - ${s}` : prefixe;
}

/**
 * Change la copro d'un objet déjà saisi : retire le préfixe de l'ancienne copro (avec ou sans
 * adresse : un objet tapé avant REA-408 la portait encore) et pose celui de la nouvelle.
 * Préfixe seul : on laisse « - » pour taper l'objet à la suite.
 */
export function remplacerPrefixeCopro(objet: string, ancienne: CoproComposition | null, nouvelle: CoproComposition | null): string {
  let reste = objet.trim();
  if (ancienne) {
    // Le plus long d'abord : le préfixe sans adresse est le début de celui avec adresse.
    const prefixes = [prefixeObjetCopro(ancienne, true), prefixeObjetCopro(ancienne, false)];
    const p = prefixes.find((x) => reste.startsWith(x));
    if (p) reste = reste.slice(p.length).replace(/^\s*-\s*/, "").trim();
  }
  return nouvelle ? (reste ? objetCompose(nouvelle, reste) : `${prefixeObjetCopro(nouvelle, false)} - `) : reste;
}

// Séparateurs qui entourent le préfixe copro sans rien dire du sujet.
const SEPARATEURS_DEBUT = /^[\s\-–—·:|,;.]+/;
const SEPARATEURS_FIN = /[\s\-–—·:|,;]+$/;

/**
 * Le vrai sujet d'un objet, une fois retiré le préfixe de la copro choisie (avec ou sans
 * adresse, ou son code seul) et les séparateurs autour. "" = l'objet ne dit rien du mail.
 * Incident du 28/10/2026 : « S159 · AUGUSTIN10 » est parti sans sujet, le préfixe seul
 * passant pour un objet.
 */
export function sujetDeLObjet(objet: string, copro: CoproComposition | null): string {
  const norme = (s: string) => s.replace(/\s+/g, " ").trim();
  let reste = norme(objet);
  if (copro) {
    const prefixes = [prefixeObjetCopro(copro, true), prefixeObjetCopro(copro, false), copro.reference].map(norme).filter(Boolean);
    // Le préfixe doit s'arrêter sur une fin de mot : le code S159 n'est pas le début de S1590.
    const p = prefixes.find((x) => reste.toLowerCase().startsWith(x.toLowerCase()) && !/^[\p{L}\p{N}]/u.test(reste.slice(x.length)));
    if (p) reste = reste.slice(p.length);
  }
  return reste.replace(SEPARATEURS_DEBUT, "").replace(SEPARATEURS_FIN, "");
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
  // Module « Contrats & contrôles » (REA-333) : les variables des modèles « Contrats : … »
  // (seed supabase/sql/intranet_contrats_modeles_mail_seed.sql). `offres` est un MARQUEUR de
  // section (tableau rendu par le service), déclaré ici pour que l'écran admin l'accepte.
  contrat_actuel_fournisseur?: string;
  contrat_actuel_type_prix?: string;
  contrat_actuel_montant?: string;
  contrat_actuel_echeance?: string;
  contrat_actuel_assureur?: string;
  contrat_actuel_prime?: string;
  devis_prestataire?: string;
  devis_montant?: string;
  offres?: string;
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
  contrat_actuel_fournisseur: true, contrat_actuel_type_prix: true, contrat_actuel_montant: true, contrat_actuel_echeance: true,
  contrat_actuel_assureur: true, contrat_actuel_prime: true, devis_prestataire: true, devis_montant: true, offres: true,
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

// --- Mail à toute la copropriété (REA-305) ---------------------------------------------------
// Pour les copros Crypto, l'intranet remplace l'envoi groupé de Crypto (« l'ascenseur est en
// panne »). Tous les copropriétaires partent en COPIE CACHÉE : jamais une adresse visible
// d'un copropriétaire à l'autre. Les deux membres d'un couple ont chacun leur adresse dans
// l'annuaire : chacun reçoit le mail.

/** Destinataires par mail, sous la limite d'Exchange Online (500 par message, À et Cc compris). */
export const LOT_MAX_DESTINATAIRES = 450;

/** Les qualités qui reçoivent un mail « à toute la copropriété » : pas les locataires ni les pros. */
const QUALITES_COPRO = new Set(["coproprietaire", "conseil_syndical"]);

/** Les adresses des copropriétaires d'une copro (conseil syndical compris), dédoublonnées et valides. */
export function adressesTouteLaCopro(contacts: readonly ContactCopro[]): string[] {
  const vues = new Set<string>();
  for (const c of contacts) {
    const email = c.email.trim().toLowerCase();
    if (QUALITES_COPRO.has(c.qualite) && adresseMailValide(email)) vues.add(email);
  }
  return [...vues].sort();
}

/**
 * Contacts d'une copro, fusionnés depuis l'annuaire Crypto et ESTALE (REA-356, 19/10/2026).
 * - `proprietairesEstale` non null (copro présente dans ESTALE) : les copropriétaires et le
 *   conseil syndical de l'annuaire Crypto sont REMPLACÉS par les propriétaires actifs
 *   d'ESTALE. Crypto y garde d'anciens copropriétaires (S178 : 80 adresses pour 42
 *   propriétaires) ; ESTALE est la source de vérité de ses copros. Locataires et
 *   professionnels de Crypto restent proposés.
 * - null (copro hors ESTALE, ou ESTALE en panne) : l'annuaire Crypto tel quel.
 * Dans les deux cas, le conseil syndical ESTALE marque « conseil_syndical » (retour du
 * 14/10 : une copro ESTALE n'a pas son CS dans Crypto) ; un membre sans adresse est ignoré.
 */
export function fusionnerContactsCopro(
  crypto: readonly ContactCopro[],
  proprietairesEstale: readonly CoproprietaireJoignable[] | null,
  conseilEstale: readonly { nomComplet: string; email?: string }[],
): ContactCopro[] {
  const parEmail = new Map<string, ContactCopro>();
  const gardes = proprietairesEstale ? crypto.filter((c) => !QUALITES_COPRO.has(c.qualite)) : crypto;
  for (const c of gardes) parEmail.set(c.email.trim().toLowerCase(), c);
  for (const p of proprietairesEstale ?? []) {
    const email = p.email.trim().toLowerCase();
    if (!email) continue;
    // Une adresse de locataire ou de pro chez Crypto qui est copropriétaire chez ESTALE : ESTALE l'emporte.
    parEmail.set(email, { email, nom: p.nom, qualite: "coproprietaire", personne: `estale:${p.id}` });
  }
  for (const m of conseilEstale) {
    const email = m.email?.trim().toLowerCase();
    if (!email) continue;
    const deja = parEmail.get(email);
    parEmail.set(email, deja ? { ...deja, qualite: "conseil_syndical" } : { email, nom: m.nomComplet, qualite: "conseil_syndical" });
  }
  return [...parEmail.values()];
}

/**
 * D'où vient la liste du conseil syndical (mêmes valeurs que la cascade du mail de date d'AG) :
 * ESTALE, la liste de diffusion CS tenue dans l'intranet (« crypto » : importée une fois de
 * Crypto, éditée depuis la fiche copro et le récap d'AG), ou rien (saisie à la main).
 */
export type SourceConseilComposition = "estale" | "crypto" | "aucune";

/** Le conseil syndical proposé par le bouton « Conseil syndical » du compositeur. */
export interface ConseilComposition {
  source: SourceConseilComposition;
  membres: ContactCopro[];
}

/**
 * Le conseil syndical du compositeur (20/10/2026) : les adresses de la MÊME cascade que le
 * mail de date d'AG (ESTALE, sinon liste de diffusion CS, sinon rien), et non plus les fiches
 * de l'annuaire Crypto cochées « conseil syndical » (couples ET individus : 11 adresses au lieu
 * de 6 sur la S288). Le nom vient des contacts de la copro quand l'adresse y figure ; une
 * adresse dédoublonnée sans casse, invalide écartée.
 */
export function conseilPourComposition(
  cascade: { source: SourceConseilComposition; emails: readonly string[] },
  contacts: readonly ContactCopro[],
): ConseilComposition {
  const noms = new Map(contacts.map((c) => [c.email.trim().toLowerCase(), c.nom]));
  const vues = new Set<string>();
  const membres: ContactCopro[] = [];
  for (const brute of cascade.emails) {
    const email = brute.trim().toLowerCase();
    if (!adresseMailValide(email) || vues.has(email)) continue;
    vues.add(email);
    membres.push({ email, nom: noms.get(email) ?? "", qualite: "conseil_syndical" });
  }
  return { source: membres.length ? cascade.source : "aucune", membres };
}

/** Les contacts d'une copro et, s'il est connu, son nombre de lots principaux (REA-356). */
export interface ContactsComposition {
  contacts: ContactCopro[];
  /** null = inconnu (0 dans le référentiel, ou lecture impossible). */
  lotsPrincipaux: number | null;
  /** Le conseil syndical à proposer en un clic (cascade ESTALE > liste de diffusion > rien). */
  conseil: ConseilComposition;
  /**
   * Le binôme à mettre en Cc quand on ajoute le conseil syndical (28/10/2026, domain/copie-binome) :
   * l'autre membre que la personne connectée ; vide si personne.
   */
  copieBinome?: { nomComplet: string; email: string }[];
}

const pluriel = (k: number, mot: string) => `${k} ${mot}${k > 1 ? "s" : ""}`;

/** Au-delà de ce nombre d'adresses par copropriétaire, la liste est suspecte (REA-356). */
export const ADRESSES_PAR_COPROPRIETAIRE_MAX = 2.5;

export interface ControleTouteLaCopro {
  /** N : adresses qui partiront en copie cachée. */
  adresses: number;
  /** M : copropriétaires distincts (personnes) derrière ces adresses. */
  coproprietaires: number;
  /** « N adresses pour M copropriétaires », pour la confirmation d'envoi. */
  resume: string;
  /** « Vérifiez la liste : … » quand le rapport est anormal ; null sinon. */
  alerte: string | null;
}

/**
 * Garde-fou du mail « toute la copropriété » (REA-356, 19/10/2026). La S178 est partie à
 * 80 adresses pour 42 copropriétaires : la confirmation dit désormais « N adresses pour M
 * copropriétaires » et alerte quand c'est anormal (plus de 2,5 adresses par personne, ou
 * plus de copropriétaires que de lots principaux). Une personne = `personne` (fiche Crypto
 * ou propriétaire ESTALE) ; à défaut son nom, à défaut son adresse.
 */
export function controleTouteLaCopro(contacts: readonly ContactCopro[], lotsPrincipaux?: number | null): ControleTouteLaCopro {
  const adresses = adressesTouteLaCopro(contacts);
  const retenues = new Set(adresses);
  const personnes = new Set<string>();
  for (const c of contacts) {
    const email = c.email.trim().toLowerCase();
    if (!QUALITES_COPRO.has(c.qualite) || !retenues.has(email)) continue;
    const nom = sansAccents(c.nom);
    personnes.add(c.personne ?? (nom ? `nom:${nom}` : `email:${email}`));
  }
  const n = adresses.length;
  const m = personnes.size;
  const alertes: string[] = [];
  if (m > 0 && n > ADRESSES_PAR_COPROPRIETAIRE_MAX * m) {
    alertes.push(`${pluriel(n, "adresse")} pour ${pluriel(m, "copropriétaire")}, c'est beaucoup d'adresses par personne`);
  }
  if (lotsPrincipaux && lotsPrincipaux > 0 && m > lotsPrincipaux) {
    alertes.push(`${pluriel(m, "copropriétaire")} pour ${pluriel(lotsPrincipaux, "lot")} principa${lotsPrincipaux > 1 ? "ux" : "l"}, d'anciens copropriétaires sont peut-être encore dans la liste`);
  }
  return {
    adresses: n,
    coproprietaires: m,
    resume: `${pluriel(n, "adresse")} pour ${pluriel(m, "copropriétaire")}`,
    alerte: alertes.length ? `Vérifiez la liste : ${alertes.join(" ; ")}.` : null,
  };
}

/** Découpe une liste d'adresses en lots d'au plus `taille` (un mail par lot). */
export function enLots<T>(liste: readonly T[], taille = LOT_MAX_DESTINATAIRES): T[][] {
  if (taille < 1) throw new Error("Taille de lot invalide.");
  const lots: T[][] = [];
  for (let i = 0; i < liste.length; i += taille) lots.push(liste.slice(i, i + taille));
  return lots;
}

/**
 * « à qui » dans la confirmation d'envoi : les deux premiers, puis « et N autres ». Sans
 * destinataire visible (toute la copro en Cci), on le dit plutôt que d'afficher du vide.
 * REA-349 (16/10/2026) : la confirmation doit dire à qui et depuis quelle boîte.
 */
export function resumeDestinataires(noms: readonly string[]): string {
  const l = [...new Set(noms.map((n) => n.trim()).filter(Boolean))];
  if (l.length === 0) return "aucun destinataire visible";
  if (l.length <= 2) return l.join(" et ");
  const reste = l.length - 2;
  return `${l.slice(0, 2).join(", ")} et ${reste} autre${reste > 1 ? "s" : ""}`;
}
