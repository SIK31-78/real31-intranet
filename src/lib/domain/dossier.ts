// Domaine du module "Dossiers" : un dossier = un cas suivi rattache a une copro,
// d'un type (travaux / sinistre / impaye / procedure / recouvrement), avec une portee
// (copro / coproprietaire / lot), un statut, une liste d'ETAPES editable (le workflow
// n'est PAS fige - decision Sekou 2026-06-23) et un journal. Types purs (ADR-001).

export type TypeDossier = "travaux" | "sinistre" | "impaye" | "procedure" | "recouvrement";
export type PorteeDossier = "copropriete" | "coproprietaire" | "lot";
export type StatutDossier = "ouvert" | "en_cours" | "clos";

/** Une etape du workflow (editable : ajout/cochage/reordo/suppression). */
export interface EtapeDossier {
  id: string;
  label: string;
  fait: boolean;
  faitLe?: string;
  faitPar?: string;
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
  /** Origine du dossier (ex "AG du 30/06/2026 - resolution 7"), pour le rattachement AG. */
  origine?: string;
  etapes: EtapeDossier[];
  journal: EvenementDossier[];
}

export const TYPE_DOSSIER_LABEL: Record<TypeDossier, string> = {
  travaux: "Travaux",
  sinistre: "Sinistre",
  impaye: "Impayé",
  procedure: "Procédure",
  recouvrement: "Recouvrement",
};
export const TYPE_DOSSIER_ORDRE: TypeDossier[] = [
  "travaux",
  "sinistre",
  "impaye",
  "recouvrement",
  "procedure",
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

/** Modeles de DEPART (suggestions) par type : pre-remplissent les etapes a la creation,
 *  puis sont entierement editables. Rien de fige. */
export const MODELES_ETAPES: Record<TypeDossier, string[]> = {
  travaux: [
    "Devis demandés",
    "Devis validés en AG",
    "Entreprise retenue",
    "Ordre de service",
    "Réception des travaux",
    "Clôture (DGD / garanties)",
  ],
  sinistre: [
    "Déclaration à l'assurance",
    "Expertise",
    "Devis de réparation",
    "Accord d'indemnisation",
    "Travaux",
    "Règlement",
    "Clôture",
  ],
  impaye: [
    "Identification de l'impayé",
    "Relance amiable 1",
    "Relance amiable 2",
    "Mise en demeure",
    "Transmission au recouvrement",
  ],
  recouvrement: [
    "Dossier transmis",
    "Injonction de payer / assignation",
    "Décision",
    "Exécution",
    "Soldé",
  ],
  procedure: ["Constat", "Saisine avocat", "Assignation", "Audience", "Décision", "Exécution"],
};

/** Progression d'un dossier (etapes faites / total). */
export function progressionDossier(d: Dossier): { faites: number; total: number; pct: number } {
  const total = d.etapes.length;
  const faites = d.etapes.filter((e) => e.fait).length;
  return { faites, total, pct: total === 0 ? 0 : Math.round((faites / total) * 100) };
}
