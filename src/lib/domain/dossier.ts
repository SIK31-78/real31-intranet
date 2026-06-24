// Domaine du module "Dossiers" : un dossier = un cas suivi rattache a une copro,
// d'un type (travaux / sinistre / impaye / procedure / recouvrement), avec une portee
// (copro / coproprietaire / lot), un statut, une liste d'ETAPES editable (le workflow
// n'est PAS fige - decision Sekou 2026-06-23) et un journal. Types purs (ADR-001).

export type TypeDossier =
  | "travaux"
  | "sinistre"
  | "impaye"
  | "procedure"
  | "recouvrement"
  | "question_diverse"
  | "autre";
export type PorteeDossier = "copropriete" | "coproprietaire" | "lot";
export type StatutDossier = "ouvert" | "en_cours" | "clos";

/** A qui une tache/etape est assignee : gestionnaire ou assistant de la copro (pas la
 *  compta). Role plutot que personne : stable, et le nom est resolu via l'equipe copro. */
export type AssigneRole = "gestionnaire" | "assistant";

/** Une etape du workflow (editable : ajout/cochage/reordo/suppression/assignation). */
export interface EtapeDossier {
  id: string;
  label: string;
  fait: boolean;
  faitLe?: string;
  faitPar?: string;
  /** Tache assignee au gestionnaire ou a l'assistant (optionnel). */
  assigneA?: AssigneRole;
}

// Timeline du dossier : un fil d'evenements TYPES. Brique 1 produit note/etape/statut ;
// plus tard on y fusionne les emails rattaches (Mes emails) puis les appels telephoniques.
export type KindEvenement = "note" | "etape" | "statut" | "email" | "appel";

export interface EvenementDossier {
  le: string;
  par: string;
  texte: string;
  kind: KindEvenement;
  /** Reference externe (ex id d'email rattache), pour les sources non-manuelles. */
  ref?: string;
}

export interface Dossier {
  id: string;
  coproCode: string;
  coproNom?: string;
  type: TypeDossier;
  portee: PorteeDossier;
  /** Cible quand la portee n'est pas la copro : nom du coproprietaire / ref du lot. */
  cible?: string;
  titre: string;
  statut: StatutDossier;
  ouvertLe: string;
  ouvertPar?: string;
  /** Origine du dossier (ex "AG du 30/06/2026 - resolution 7"), texte libre legacy. */
  origine?: string;
  /** Rattachement structure a une AG (C5) : date de l'AG, ISO "YYYY-MM-DD". */
  agDate?: string;
  /** Numero de la resolution d'AG dont decoule le dossier (C5), ex "7" ou "B.3". */
  numeroResolution?: string;
  etapes: EtapeDossier[];
  journal: EvenementDossier[];
}

export const TYPE_DOSSIER_LABEL: Record<TypeDossier, string> = {
  travaux: "Travaux",
  sinistre: "Sinistre",
  impaye: "Impayé",
  procedure: "Procédure",
  recouvrement: "Recouvrement",
  question_diverse: "Questions diverses",
  autre: "Autres",
};
export const TYPE_DOSSIER_ORDRE: TypeDossier[] = [
  "travaux",
  "sinistre",
  "impaye",
  "recouvrement",
  "procedure",
  "question_diverse",
  "autre",
];

export const PORTEE_LABEL: Record<PorteeDossier, string> = {
  copropriete: "Copropriété",
  coproprietaire: "Copropriétaire",
  lot: "Lot (privatif)",
};

export const STATUT_DOSSIER_LABEL: Record<StatutDossier, string> = {
  ouvert: "Ouvert",
  en_cours: "En cours",
  clos: "Clos",
};

/** Une etape de modele : libelle + assignataire PAR DEFAUT (pre-attribution, C7).
 *  Les defauts (admin -> assistant, decisions / juridique -> gestionnaire) sont des
 *  SUGGESTIONS : tout reste editable et reassignable a la creation comme apres. */
export interface EtapeModele {
  label: string;
  assigneA?: AssigneRole;
}

/** Modeles de DEPART (suggestions) par type : pre-remplissent les etapes a la creation,
 *  puis sont entierement editables. Rien de fige. */
export const MODELES_ETAPES: Record<TypeDossier, EtapeModele[]> = {
  travaux: [
    { label: "Devis demandés", assigneA: "assistant" },
    { label: "Devis validés en AG", assigneA: "gestionnaire" },
    { label: "Entreprise retenue", assigneA: "gestionnaire" },
    { label: "Ordre de service", assigneA: "gestionnaire" },
    { label: "Réception des travaux", assigneA: "gestionnaire" },
    { label: "Clôture (DGD / garanties)", assigneA: "assistant" },
  ],
  sinistre: [
    { label: "Déclaration à l'assurance", assigneA: "assistant" },
    { label: "Expertise", assigneA: "gestionnaire" },
    { label: "Devis de réparation", assigneA: "assistant" },
    { label: "Accord d'indemnisation", assigneA: "gestionnaire" },
    { label: "Travaux", assigneA: "gestionnaire" },
    { label: "Règlement", assigneA: "assistant" },
    { label: "Clôture", assigneA: "assistant" },
  ],
  impaye: [
    { label: "Identification de l'impayé", assigneA: "assistant" },
    { label: "Relance amiable 1", assigneA: "assistant" },
    { label: "Relance amiable 2", assigneA: "assistant" },
    { label: "Mise en demeure", assigneA: "gestionnaire" },
    { label: "Transmission au recouvrement", assigneA: "gestionnaire" },
  ],
  recouvrement: [
    { label: "Dossier transmis", assigneA: "gestionnaire" },
    { label: "Injonction de payer / assignation", assigneA: "gestionnaire" },
    { label: "Décision", assigneA: "gestionnaire" },
    { label: "Exécution", assigneA: "gestionnaire" },
    { label: "Soldé", assigneA: "assistant" },
  ],
  procedure: [
    { label: "Constat", assigneA: "assistant" },
    { label: "Saisine avocat", assigneA: "gestionnaire" },
    { label: "Assignation", assigneA: "gestionnaire" },
    { label: "Audience", assigneA: "gestionnaire" },
    { label: "Décision", assigneA: "gestionnaire" },
    { label: "Exécution", assigneA: "gestionnaire" },
  ],
  // Catch-all : aucune etape pre-remplie (entierement libre, on ajoute a la main).
  question_diverse: [],
  autre: [],
};

/** Prochaine etape a faire d'un dossier (premiere non cochee), ou undefined si tout
 *  est fait / aucune etape. Sert au panneau "Dossiers a suivre" du dashboard (C3). */
export function prochaineEtape(d: Dossier): EtapeDossier | undefined {
  return d.etapes.find((e) => !e.fait);
}

// --- Actions de dossiers remontees au dashboard (C3) : la prochaine etape de chaque
//     dossier ouvert, groupee par copropriete. ---

export interface ActionDossier {
  dossierId: string;
  titre: string;
  type: TypeDossier;
  /** Libelle de la prochaine etape a faire. */
  etapeLabel: string;
  assigneA?: AssigneRole;
}

export interface ActionsDossierCopro {
  coproCode: string;
  coproNom: string;
  actions: ActionDossier[];
}

/** Progression d'un dossier (etapes faites / total). */
export function progressionDossier(d: Dossier): { faites: number; total: number; pct: number } {
  const total = d.etapes.length;
  const faites = d.etapes.filter((e) => e.fait).length;
  return { faites, total, pct: total === 0 ? 0 : Math.round((faites / total) * 100) };
}
