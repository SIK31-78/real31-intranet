// Port (contrat) de la facturation des honoraires de syndic (tables natives
// intranet_tarifs / intranet_suivi_contrats / intranet_factures / intranet_facture_lignes).
//
// Le CALCUL des montants vit dans le domaine (lib/domain/facturation) ; ce port
// ne porte que la resolution du bareme et la persistance. Ne depend d'aucune
// techno (ni Supabase, ni Pennylane).

import type { CycleTarif } from "@/lib/domain/facturation/filet-gestion-courante";

/** Types de prestation SYNDIC facturables (cf. intranet_factures.type_prestation). */
export type TypePrestation =
  | "depassement_cs"
  | "suivi_travaux"
  | "suivi_sinistre"
  | "pre_etat_date"
  | "etat_date"
  | "depassement_ag"
  | "gestion_courante"
  /** Les 16 prestations particulieres du contrat (domain/facturation/prestations-contrat). */
  | "prestation_contrat";

export type StatutFacture = "a_facturer" | "facturee" | "erreur";

/** Contrat de gestion courante d'une copropriete. */
export interface ContratCopro {
  id: string;
  coproCode: string;
  /** Debut du contrat, ISO "YYYY-MM-DD". Son annee determine le bareme applicable. */
  debutContrat: string;
  honorairesGestionTtc?: number;
  forfaitPostauxTtc?: number;
  /**
   * Fin du cycle, ISO, quand elle est STOCKEE (contrats a duree libre depuis le
   * 14/09/2026). Absente = ancienne regle, debut + 1 an - 1 jour.
   */
  finContrat?: string;
  /**
   * Tarifs TTC FIGES au contrat par le recap AG (depuis le 15/09/2026), par identifiant
   * de prestation. Absent = les cycles d'avant, tarifes par l'annee du bareme.
   */
  tarifs?: Record<string, number>;
  /**
   * Jour ou ce cycle a ete ENREGISTRE (created_at), ISO "YYYY-MM-DD". C'est le recap AG
   * qui l'ecrit : un cycle enregistre apres une AG dit que son recap a ete fait - alors
   * que sa date de DEBUT, elle, precede souvent l'AG (mandat retroactif au 1er du mois).
   */
  enregistreLeISO?: string;
}

/** Ligne a facturer. Montant HT, aligne sur les invoice_lines Pennylane. */
export interface LigneFactureInput {
  /** Detail affiche sous le titre (dates, heures, diligence...). */
  description: string;
  /** Categorie de produit (cf. domain/facturation/produits) : resout le libelle,
   *  le product_id et le compte comptable selon l'agence de la copro a l'emission. */
  categorieProduit?: string;
  quantite: number;
  prixUnitaireHt: number;
  /** Defaut : 0.20 (cote base). */
  tauxTva?: number;
}

/** Produit de facturation (liste Produits), par (categorie, agence). */
export interface Produit {
  categorie: string;
  agence: string;
  /** Libelle affiche sur la facture, ex "Honoraires gestion courante LGC". */
  titre: string;
  pennylaneProductId: string;
  /** Compte comptable de produits (rattachement compta). */
  ledgerAccountId: string;
}

export interface NouvelleFacture {
  /** Code copro (referenceCrypto), cle logique dans intranet_factures. */
  coproCode: string;
  typePrestation: TypePrestation;
  libelle: string;
  /** ISO "YYYY-MM-DD". */
  dateFacture: string;
  /** ISO "YYYY-MM-DD". */
  datePrestation?: string;
  /** Periode de facturation (ex "2026-T3"), pour la gestion courante uniquement. */
  periode?: string;
  /** Champs specifiques au type de prestation (tracabilite du calcul). */
  details?: Record<string, unknown>;
  /** Initiales de l'auteur (tant qu'il n'y a pas d'auth). */
  par?: string;
  lignes: LigneFactureInput[];
}

/**
 * Parametres contractuels d'une copropriete, lus sur public."Copropriete"
 * (App A). Servent d'entree aux calculs de depassement.
 *
 * IMPORTANT : chaque champ vaut `null` quand la colonne source est ABSENTE
 * (donnee non renseignee sur la fiche), a distinguer d'un `0` explicite (valeur
 * assumee). Un `null` ne doit JAMAIS etre remplace par un defaut permissif : le
 * service de la prestation concernee refuse alors de facturer (plutot que de
 * sur-facturer sur une franchise ou une plage inconnue). Cf. getParametresCopro.
 */
export interface ParametresCopro {
  /**
   * Duree de reunion CS incluse au contrat, en HEURES. `null` si non renseignee.
   *
   * ATTENTION : la colonne source s'appelle `csDurationMinutes` mais contient
   * bien des HEURES. Constate sur les 265 copropriétés : valeurs 0/1/2/3
   * (217 a la valeur 1) : des reunions de 1 a 3 MINUTES n'auraient aucun sens,
   * et `agDurationHours` vaut 2 en parallele. Le nom de colonne est trompeur.
   */
  franchiseCsHeures: number | null;
  /** Duree d'AG incluse au contrat, en heures (agDurationHours). `null` si absente. */
  dureeAgHeures: number | null;
  /** Heure de debut de la plage contractuelle d'AG (agStartMin). `null` si absente. */
  debutMinAgHeure: number | null;
  /** Heure de fin de la plage contractuelle d'AG (agEndMax). `null` si absente. */
  finMaxAgHeure: number | null;
}

/** Ligne d'historique de facturation (vue utilisateur). */
export interface FactureHistorique {
  id: string;
  coproCode: string;
  typePrestation: TypePrestation;
  libelle: string;
  dateFacture: string;
  statut: StatutFacture;
  /** Total HT = somme des lignes. */
  montantHt: number;
  /** Identifiant du brouillon chez le fournisseur, si emis. */
  factureExterneId?: string;
  /** Message du dernier echec d'emission, si en erreur. */
  erreur?: string;
  /** Initiales de l'auteur. */
  par?: string;
  /** Horodatage ISO de creation. */
  creeLe: string;
}

/** Facture en attente d'emission, avec ses lignes. */
export interface FactureAEmettre {
  id: string;
  coproCode: string;
  typePrestation: TypePrestation;
  libelle: string;
  dateFacture: string;
  /** Champs specifiques au type de prestation, tels qu'ils ont ete stockes a la
   *  creation (cf. NouvelleFacture.details). Necessaires a l'emission : le suivi
   *  de sinistre y porte la reference que la compta doit retrouver sur le PDF. */
  details?: Record<string, unknown> | null;
  lignes: Array<{
    description: string;
    categorieProduit: string | null;
    quantite: number;
    prixUnitaireHt: number;
    tauxTva: number;
  }>;
}

/** Une copropriete facturable en gestion courante pour un trimestre. */
export interface LigneGestionCourante {
  coproCode: string;
  /** Honoraires annuels TTC du contrat en vigueur au DEBUT du trimestre facture.
   *  `null` = AUCUN contrat en vigueur (la copro est quand meme remontee, pour etre
   *  signalee « contrat non renseigne » plutot que de disparaitre sans bruit). */
  honorairesAnnuelsTtc: number | null;
  /** Tous les cycles commences au plus tard a la fin du trimestre, du plus ancien au
   *  plus recent : un changement de tarif en cours de trimestre est facture au prorata
   *  (cf. domain/facturation/filet-gestion-courante, segmentsTrimestre). */
  cycles: CycleTarif[];
  /** Forfait postaux annuel du contrat en vigueur. */
  forfaitPostauxAnnuel: number;
  /** Vrai = frais postaux refactures au reel (ailleurs) : pas de ligne de timbres
   *  trimestrielle. Faux (ou absent) = forfait postaux annuel / 4 applique. */
  fraisPostauxReels: boolean;
  /** Vrai si une facture de gestion courante existe deja pour ce trimestre. */
  dejaFacture: boolean;
  /** Date de la facture de gestion courante deja emise sur ce trimestre, ISO
   *  "YYYY-MM-DD". Sert au message « deja facturee le JJ/MM ». */
  dejaFactureLe?: string | null;
  /** Date de prise en gestion (Copropriete.syndicInitialDate), ISO ou timestamp
   *  ISO. Une copro prise en gestion EN COURS de trimestre est due au prorata
   *  des jours couverts. `null` si la date est inconnue -> trimestre plein. */
  priseEnGestion?: string | null;
}

/**
 * Les champs de la copropriete imprimes sur le contrat de syndic. Tout vient de la
 * table `Copropriete` (App A, lecture seule). Null = absent de la fiche : c'est au
 * service de decider si le contrat peut sortir sans.
 */
export interface DonneesContratCopro {
  code: string;
  nom: string;
  adresse1: string | null;
  adresse2: string | null;
  adresse3: string | null;
  codePostal: string | null;
  ville: string | null;
  /** Numero au registre national des coproprietes (`registrationNumber`). */
  immatriculation: string | null;
  /** Compagnie d'assurance (`insuranceCompany`). */
  assurance: string | null;
  /** Souscription de l'assurance, ISO (`insuranceSubscriptionDate`). */
  assuranceDateISO: string | null;
  /** Id technique de l'agence. Le SERVICE le resout en code lisible (ML / LGC / HLS /
   *  ASN) via services/agences : un adapter n'appelle pas un service (ADR-001). */
  agenceId: string | null;
  lotsPrincipaux: number | null;
  lotsAutres: number | null;
  /** Visites incluses au contrat (`visitCount`). */
  nbVisites: number | null;
  /** Conseils syndicaux inclus (`csCount`). */
  nbCs: number | null;
  /** Fin du mandat en cours, ISO (`syndicContractEndDate`) : origine du cycle suivant. */
  finMandatISO: string | null;
  /** Date de prise en gestion (`syndicInitialDate`), ISO : debut propose pour une
   *  reprise, quand aucun cycle n'existe encore. */
  priseEnGestionISO: string | null;
}

/** Une edition de contrat de syndic deja realisee (historique MYTHEC + editions futures). */
export interface EditionContrat {
  coproCode: string;
  titre: string | null;
  dateAgISO: string | null;
  /** Honoraires REELLEMENT portes au contrat : augmentation d'AG comprise. */
  honorairesGestionTtc: number | null;
  forfaitPostauxTtc: number | null;
  statut: "termine" | "erreur";
  messageErreur: string | null;
  /** Cycle imprime sur le document. null pour les editions MYTHEC (non exportees). */
  debutISO: string | null;
  finISO: string | null;
  /** Frais postaux au reel sur ce document. false pour les editions MYTHEC (forfait). */
  fraisPostauxReels: boolean;
  /** Horodatage de l'edition, ISO. */
  creeLe: string;
  creePar: string | null;
}

/** Ce que l'intranet enregistre quand il edite un contrat. */
export interface NouvelleEditionContrat {
  coproCode: string;
  dateAgISO: string;
  debutISO: string;
  finISO: string;
  honorairesGestionTtc: number;
  forfaitPostauxTtc: number;
  fraisPostauxReels: boolean;
  /** Nom complet de qui edite. */
  creePar: string;
}

/** Une ligne du bareme annuel. */
export interface LigneBareme {
  identifiantPrestation: string;
  libelle: string;
  montantTtc: number;
}

export interface FacturationRepository {
  /** Montant TTC du bareme pour une prestation et une annee. Null si absent. */
  getTarifTtc(identifiantPrestation: string, annee: number): Promise<number | null>;
  /**
   * TOUT le bareme d'une annee, en UNE lecture. Le contrat de syndic cite 21
   * prestations : les chercher une par une ferait 21 allers-retours, ce que le flow
   * PowerApps faisait deja et que l'audit de migration pointait comme un defaut.
   * Porte aussi le `libelle`, que le contrat imprime.
   */
  listerBareme(annee: number): Promise<LigneBareme[]>;
  /** Les annees qui ont au moins une ligne au bareme, les plus recentes d'abord. */
  listerAnneesBareme(): Promise<number[]>;
  /** Cree ou remplace une ligne du bareme (cle : annee + identifiant). Panel d'administration. */
  enregistrerTarif(ligne: LigneBareme & { annee: number }): Promise<void>;
  /** Retire une ligne du bareme d'une annee. Les tarifs figes aux contrats ne bougent pas. */
  supprimerTarif(annee: number, identifiantPrestation: string): Promise<void>;
  /** Contrat de gestion le plus recent d'une copro. Null si aucun. */
  getDernierContrat(coproCode: string): Promise<ContratCopro | null>;
  /**
   * Le contrat le plus recent de CHAQUE copropriete demandee, en UNE lecture.
   * L'ecran des contrats de syndic en a besoin pour tout un portefeuille : les chercher
   * un par un faisait autant d'allers-retours que de coproprietes.
   */
  listerDerniersContrats(coproCodes: string[]): Promise<Map<string, ContratCopro>>;
  /** Parametres contractuels de la copro (franchises, plage d'AG). Null si copro inconnue. */
  getParametresCopro(coproCode: string): Promise<ParametresCopro | null>;
  /**
   * Champs de la copropriete qui figurent DANS le contrat de syndic (adresse complete
   * sur trois lignes, immatriculation, assurance, lots, prestations incluses).
   * Null si la copro est inconnue.
   *
   * Methode dediee plutot qu'un elargissement de `Copropriete` : ces champs ne servent
   * qu'au contrat imprime (adresse ligne 2 et 3, assureur, date de souscription), et le
   * domaine Copropriete n'a pas a s'alourdir pour un seul document.
   */
  getDonneesContrat(coproCode: string): Promise<DonneesContratCopro | null>;
  /**
   * Les contrats deja edites pour cette copropriete, du plus recent au plus ancien.
   * [] si la table n'existe pas encore : l'historique est un CONFORT, son absence ne doit
   * jamais empecher d'editer un contrat.
   */
  listerEditionsContrat(coproCode: string): Promise<EditionContrat[]>;
  /**
   * Les editions de CHAQUE copropriete demandee, en UNE lecture, du plus recent au plus
   * ancien. L'ecran des contrats en a besoin pour dire ou en est chaque copro (edite,
   * recap a faire...) sans faire un aller-retour par ligne.
   * Map vide si la table n'existe pas encore : meme degradation que listerEditionsContrat.
   */
  listerEditionsContrats(coproCodes: string[]): Promise<Map<string, EditionContrat[]>>;
  /**
   * Trace une edition realisee par l'intranet (statut « termine »). C'est ce qui fait
   * passer la copro en « genere » dans la liste, et ce que le recap AG proposera.
   * Ne leve pas si la table manque : l'edition n'est pas bloquee par sa trace.
   */
  enregistrerEditionContrat(input: NouvelleEditionContrat): Promise<void>;
  /** Ouvre un cycle de contrat (une AG en ouvre un). Renvoie son id. */
  creerContrat(input: {
    coproCode: string;
    debutContrat: string;
    /** Fin du cycle (duree libre). Absente = debut + 1 an - 1 jour. */
    finContrat?: string;
    /** Tarifs TTC figes au contrat (photo du bareme de l'annee de l'AG). */
    tarifs?: Record<string, number>;
    honorairesGestionTtc?: number;
    /** true = frais reels refactures, false = forfait annuel. */
    fraisPostauxReels?: boolean;
    forfaitPostauxTtc?: number;
  }): Promise<string>;
  /** Cree une facture et ses lignes. Renvoie l'id de la facture creee. */
  creerFacture(input: NouvelleFacture): Promise<string>;
  /** Tous les produits (liste Produits), pour resoudre libelle + ids a l'emission. */
  chargerProduits(): Promise<Produit[]>;
  /** Code agence (ML/LGC/HLS) de la copro, pour choisir le bon produit. Null si inconnu. */
  getAgenceCopro(coproCode: string): Promise<string | null>;
  /** Base facturable de la gestion courante pour un trimestre : les copros
   *  actives ayant un contrat en vigueur, avec le drapeau deja-facture. */
  chargerGestionCourante(periode: string): Promise<LigneGestionCourante[]>;

  // --- Emission vers l'outil de facturation externe ---

  /** Parmi les factures donnees, celles au statut 'a_facturer', avec leurs lignes.
   *  On emet TOUJOURS un lot explicite : jamais toute la file, pour qu'une facture
   *  laissee volontairement en attente ne parte pas par erreur. */
  listerFacturesAEmettre(ids: string[]): Promise<FactureAEmettre[]>;
  /** Identifiant client Pennylane d'une copro (Copropriete.pennylaneId). Null si absent. */
  getClientFacturationRef(coproCode: string): Promise<string | null>;
  /** Marque la facture comme emise et memorise l'id externe. */
  marquerFacturee(factureId: string, factureExterneId: string): Promise<void>;
  /** Marque la facture en erreur et memorise le message (diagnostic). */
  marquerErreur(factureId: string, message: string): Promise<void>;
  /** Historique des facturations, les plus recentes d'abord. Si `coproCodes` est fourni,
   *  BORNE aux factures de ces copros (le filtre est applique dans la requete, AVANT la
   *  limite : cloisonnement portefeuille = "nos facturations"). Omis = toutes. */
  listerFacturesRecentes(limite?: number, coproCodes?: string[]): Promise<FactureHistorique[]>;
  /** Repasse une facture en erreur au statut 'a_facturer' pour la rejouer. */
  remettreEnAttente(factureId: string): Promise<void>;
}
