/**
 * Modèle du dossier en cours (CLAUDE.md §5).
 *
 * Schéma sérialisable JSON, sans dépendance UI : c'est le futur format de
 * persistance/import de la V2. La `referenceInterne` suit le format normé
 * `SIN-{ANNEE}-{NNNN}` (clé de rattachement des mails en V3).
 */

import type { NodeId } from './arbre';
import type { WizardState } from './wizard';

export interface ImmeubleInfo {
  nom: string;
  adresse: string;
}

export type StatutAssurance = 'assure' | 'non_assure' | 'inconnu';

/** Coordonnées d'assureur d'une partie (toutes facultatives, saisie progressive). */
export interface AssureurRef {
  nom: string;
  numeroPolice?: string;
  numeroSinistre?: string;
}

/** Assureur de l'immeuble, au niveau du sinistre. */
export interface AssureurImmeuble {
  nom: string;
  numeroPolice: string;
  numeroSinistre?: string;
}

/** Une partie au sinistre (copropriétaire, occupant…). */
export interface Partie {
  nom: string;
  email?: string;
  statutAssurance: StatutAssurance;
  assureur?: AssureurRef;
}

/** Parties rattachées à un local. */
export interface PartiesLocal {
  coproprietaire?: Partie;
  occupant?: Partie;
}

export type RolePartie = keyof PartiesLocal;

/** État explicite d'un item de checklist tri-états (absence = « à faire »). */
export type MesureEtat = 'fait' | 'sans_objet';

/** Statut du dossier - liste fermée (miroir du CHECK SQL `sinistres.statut`). */
export type StatutDossier =
  | 'brouillon'
  | 'qualifié'
  | 'en_expertise'
  | 'en_attente_facturation'
  | 'clos'
  | 'annulé';

/** Poste d'assiette (justificatif persisté de la tranche - arbitrage 3). */
export interface AssiettePoste {
  libelle: string;
  montantHt: number;
}

/** Qui convoque le rendez-vous d'expertise (H-3). */
export type ConvoquePar = 'assureur_partie' | 'assureur_immeuble' | 'autre';

/** Rendez-vous d'expertise noté par le gestionnaire (H-3). */
export interface RendezVousExpertise {
  id: string;
  /** Date (et heure si saisie). */
  date: string;
  lieu?: string;
  convoquePar: ConvoquePar;
  /** Nom de l'assureur/cabinet convoquant. */
  precisionConvocant?: string;
  /** Case « Facturé » (MVP : simple booléen ; V2/V3 : état Pennylane). */
  facture: boolean;
}

export interface LocalSinistre {
  id: string;
  /** Libellé libre, ex. « Appt 3e gauche », « Parties communes cage A ». */
  libelle: string;
  /**
   * Parcours ordonné de ce local (source de vérité du moteur).
   * Les champs `reponses` / `noeudCourant` / `resultatId` / `cas213` de
   * CLAUDE.md §5 sont dérivés de cet état via les sélecteurs du moteur.
   */
  wizard: WizardState;
  /** Coordonnées facultatives des parties (capture non bloquante). */
  parties?: PartiesLocal;
  /**
   * État des items de checklist tri-états (clé = `ChecklistItem.id`, stable).
   * Une clé absente vaut « à faire ». Non bloquant pour la navigation.
   */
  mesures?: Record<string, MesureEtat>;
  /** Points de vigilance cochés (clé = id du point, ex. « parquet ») - G-6. */
  pointsVigilance?: Record<string, boolean>;
  /** Rendez-vous d'expertise notés pour ce local - H-3. */
  rendezVousExpertise?: RendezVousExpertise[];
  /**
   * Postes d'assiette (justificatif, arbitrage 3). Le total est une projection
   * (somme) calculée à l'écriture ; la tranche reste dérivée du wizard.
   */
  assiettePostes?: AssiettePoste[];
}

export interface FicheSinistre {
  /** Référence normée SIN-{ANNEE}-{NNNN}, générée et modifiable. */
  referenceInterne: string;
  /** Date du sinistre (ISO `YYYY-MM-DD`). */
  date: string;
  immeuble: ImmeubleInfo;
  descriptif: string;
  /** Assureur de l'immeuble (niveau sinistre, facultatif). */
  assureurImmeuble?: AssureurImmeuble;
  locaux: LocalSinistre[];
}

/** Vue dérivée d'un local, conforme aux champs documentés au §5. */
export interface LocalVue {
  reponses: Record<NodeId, string>;
  noeudCourant: NodeId;
  resultatId?: NodeId;
  cas213?: number;
}
