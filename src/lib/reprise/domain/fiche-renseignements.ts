// Domaine PUR de la "fiche de renseignements coproprietaire" (post-reprise). Aucune
// dependance framework / reseau / crypto : types + transitions + validation de forme.
//
// Contexte metier : a la creation d'une copro reprise, le cabinet envoie une fiche de
// renseignements PAR COURRIER (80 % des owners n'ont pas d'email connu apres l'AG de
// reprise). Le coproprietaire remplit un formulaire web (email + coordonnees) ; a la
// validation par le gestionnaire, l'email est ecrit dans eStale et un mail "espace client
// pret" part automatiquement.
//
// Securite (le detail token/hash/anti-enumeration vit dans les services + la route publique) :
// une fiche porte un token secret (dans le lien) et un code personnel (imprime), tous deux
// stockes HASHES. Le domaine ne connait que les hash (jamais les secrets en clair).

/** Etat d'une fiche dans le flux courrier -> soumission -> validation. */
export type FicheStatut = "courrier_genere" | "soumis" | "valide";

/** Occupation du lot (section 4 du modele cabinet). */
export type Occupation = "principale" | "secondaire" | "loue";

/** Rythme de prelevement souhaite (section 6). "aucun" = pas de prelevement. */
export type Prelevement = "aucun" | "trimestriel" | "mensuel";

/**
 * Donnees CONNUES du cabinet au moment de la generation du courrier (snapshot du jeu
 * persiste). Sert a (a) pre-remplir le courrier, (b) pre-remplir le formulaire web apres
 * saisie du code, (c) comparer connu vs soumis a l'ecran de validation. PII : stocke en
 * base interne (jsonb), jamais logue, jamais affiche avant saisie du code cote public.
 */
export interface DonneesConnues {
  civilite: string;
  nom: string;
  prenom?: string;
  pro: boolean;
  emailConnu?: string;
  telFixe?: string;
  telPortable?: string;
  adrNum?: string;
  adrVoie?: string;
  adrComplement?: string;
  adrCodePostal?: string;
  adrVille?: string;
  pays?: string;
  /** Numeros de lots detenus (affichage courrier "identification de vos lots"). */
  lots?: number[];
}

/**
 * Donnees SAISIES par le coproprietaire dans le formulaire web. email est le seul champ
 * requis (c'est la raison d'etre de la fiche : ouvrir l'extranet eStale). Le reste complete
 * le dossier cabinet (traite manuellement ; SEUL l'email est pousse dans eStale a ce stade).
 */
export interface DonneesSoumises {
  email: string;
  telFixe?: string;
  telPortable?: string;
  // Section 2 : correction des coordonnees pre-remplies.
  adrNum?: string;
  adrVoie?: string;
  adrComplement?: string;
  adrCodePostal?: string;
  adrVille?: string;
  // Section 2 : societe / SCI / indivision.
  denomination?: string;
  formeJuridique?: string;
  mandataire?: string;
  // Second coproprietaire / co-indivisaire.
  secondNom?: string;
  secondTel?: string;
  secondEmail?: string;
  // Section 4 : occupation + occupant si loue.
  occupation?: Occupation;
  occupantNom?: string;
  occupantTel?: string;
  occupantEmail?: string;
  // Section 5 : gestion par un tiers.
  gestionnaireNom?: string;
  gestionnaireAdresse?: string;
  gestionnaireContact?: string;
  gestionnaireRegleCharges?: boolean;
  // Section 6 : preferences de communication.
  recevoirParCourriel?: boolean;
  refuseLRE?: boolean;
  prelevement?: Prelevement;
  // Section 7 : consentements.
  consentPrestataires?: boolean;
  consentActualites?: boolean;
}

/**
 * Une fiche de renseignements persistee. Cle metier = (coproCode, ownerId). Le token et le
 * code sont hashes (SHA-256) ; le domaine ne voit jamais les secrets en clair. Les dates sont
 * des ISO strings (fournies par l'appelant : pas d'horloge dans le domaine).
 */
export interface FicheRenseignement {
  coproCode: string;
  ownerId: string;
  tokenHash: string;
  codeHash: string;
  statut: FicheStatut;
  connues: DonneesConnues;
  soumises?: DonneesSoumises;
  courrierGenereAt: string;
  soumisAt?: string;
  valideAt?: string;
  mailEnvoyeAt?: string;
  derniereRelanceAt?: string;
  expiresAt: string;
  /**
   * Canal d'envoi de la fiche : "courrier" (postal, defaut historique) ou "email" (quand un email
   * valide est connu -> on envoie le lien + le code par mail au lieu d'imprimer un courrier). ADDITIF :
   * absent = courrier (retro-compat). Le mail "espace client pret" a la validation reste inchange.
   */
  canal?: "courrier" | "email";
  /** Date d'envoi de la fiche PAR EMAIL (bonus email). Distinct de mailEnvoyeAt (mail de validation). */
  envoiEmailAt?: string;
}

/** true si la fiche est expiree a la date donnee (ISO). */
export function estExpiree(fiche: Pick<FicheRenseignement, "expiresAt">, nowISO: string): boolean {
  return fiche.expiresAt <= nowISO;
}

/**
 * La fiche accepte-t-elle une (nouvelle) soumission ? Uniquement si le courrier est genere
 * (jamais soumise) ET non expiree. Une fiche deja soumise/validee se re-affiche en lecture
 * seule (une seule soumission, regle metier).
 */
export function peutSoumettre(
  fiche: Pick<FicheRenseignement, "statut" | "expiresAt">,
  nowISO: string,
): boolean {
  return fiche.statut === "courrier_genere" && !estExpiree(fiche, nowISO);
}

/** Duree de validite d'une fiche : 90 jours (spec). */
export const DUREE_VALIDITE_JOURS = 90;

/** Calcule l'ISO d'expiration a partir d'une date de generation (UTC, deterministe). */
export function calculerExpiration(genereAtISO: string, jours = DUREE_VALIDITE_JOURS): string {
  const d = new Date(genereAtISO);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString();
}

/** Libelle humain d'un statut (UI de suivi cote gestionnaire). */
export const STATUT_LABEL: Record<FicheStatut, string> = {
  courrier_genere: "Courrier genere",
  soumis: "Repondu - a valider",
  valide: "Valide",
};
