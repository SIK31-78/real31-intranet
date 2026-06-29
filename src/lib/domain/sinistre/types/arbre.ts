/**
 * Types de l'arbre de décision (src/data/arbre-decision-dde.json).
 *
 * Le code ne connaît que les TYPES de nœuds (question | etape | resultat) et la
 * structure générique des données. Aucune règle métier n'est codée ici : tout le
 * contenu (questions, libellés, plafonds, références) vit dans le JSON.
 */

export type NodeId = string;

/** Une option de réponse à un nœud `question`. */
export interface NodeOption {
  label: string;
  suivant: NodeId;
  /** Cas du tableau IRSI 2.1.3 (désignation du gestionnaire), si porté par l'option. */
  cas_213?: number;
  /** Marque une réponse d'incertitude (« Je ne sais pas ») - E-2. */
  incertitude?: boolean;
  /** Marque un sinistre mixte (privatif + parties communes) - G-5. */
  mixte?: boolean;
  /** Note explicative facultative (ex. « Convention applicable malgré l'indétermination »). */
  note?: string;
}

interface NodeCommon {
  phase: string;
  references?: string[];
}

/** Phase d'affichage d'une mesure : urgence (écran d'ouverture) ou démarches (synthèse). */
export type PhaseMesure = 'urgence' | 'demarches';

/** Point de vigilance déclenché par une case à cocher (G-6, ex. parquet/Titre 10). */
export interface PointVigilance {
  id: string;
  declencheur_case: string;
  titre: string;
  corps: string;
  references?: string[];
}

/** Item d'une checklist tri-états, porteur d'un responsable et d'une phase (C-1/D-1/F-1). */
export interface ChecklistItem {
  id: string;
  libelle: string;
  /** Token de responsabilité (gestionnaire | occupant | parties | gestionnaire_ou_occupant). */
  responsable: string;
  /** Où la mesure devient actionnable (F-1). */
  phase: PhaseMesure;
}

/** Nœud interrogeant l'utilisateur ; branche selon l'option choisie. */
export interface QuestionNode extends NodeCommon {
  type: 'question';
  question: string;
  aide?: string;
  /** Index (0-based) de l'option présélectionnée visuellement (focus), sans réponse implicite (H-1). */
  option_par_defaut?: number;
  /** Encart « Où trouver l'information » pour les questions factuelles (C-6). */
  aide_trancher?: string;
  /** Points de vigilance déclenchés par case à cocher (G-6). */
  points_vigilance?: PointVigilance[];
  regles?: string[];
  options: NodeOption[];
}

/** Nœud d'information / checklist ; avance vers un unique nœud `suivant`. */
export interface EtapeNode extends NodeCommon {
  type: 'etape';
  titre: string;
  suivant: NodeId;
  /** Étape « transparente » : non affichée en plein écran, traversée sans pause (G-3). */
  transparent?: boolean;
  checklist?: ChecklistItem[];
  alerte?: string;
  regles?: string[];
  regles_organisation?: string[];
  regles_prise_en_charge?: string[];
  composition_assiette?: Record<string, string[]>;
  gestionnaire?: string;
  role_gestionnaire?: string;
  actions_syndic?: string[];
}

/** Nœud terminal : synthèse de prise en charge / sortie. */
export interface ResultatNode extends NodeCommon {
  type: 'resultat';
  titre: string;
  evaluation?: string;
  specificite?: string;
  renvoi?: string;
  prise_en_charge?: string[];
  recours?: string;
  bareme_dde?: Record<string, string>;
  conduite?: string;
  expertise?: string;
  concertation?: string;
  actions_syndic?: string[];
}

export type DecisionNode = QuestionNode | EtapeNode | ResultatNode;
export type NodeType = DecisionNode['type'];

export interface ArbreMeta {
  titre: string;
  version: string;
  sources: Record<string, string>;
  regle_appreciation: string;
  parametres: Record<string, number>;
  principes: string[];
  noeud_initial: NodeId;
}

export type Lexique = Record<string, string>;

export interface ArbreDecision {
  meta: ArbreMeta;
  nodes: Record<NodeId, DecisionNode>;
  lexique: Lexique;
}
