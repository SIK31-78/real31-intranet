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
  /** Note libre de l'etape (#6) : detail/contexte propre a l'etape, pour ne plus
   *  entasser dans le titre. Optionnel, edite via majNoteEtapeAction. */
  note?: string;
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

/** Index de l'etape EN COURS = premiere etape non faite (deduit, cf. "colonne de vie").
 *  -1 si toutes les etapes sont faites ou s'il n'y en a aucune. Pur. */
export function indexEtapeEnCours(d: Pick<Dossier, "etapes">): number {
  return d.etapes.findIndex((e) => !e.fait);
}

/** Action attachee a une etape, deduite de son libelle (heuristique sure : on ne
 *  fabrique rien, on ne lit que ce qui est dans le libelle). Pur, sans JSX/React :
 *  l'UI decide du rendu (lien/bouton). undefined = etape non actionnable.
 *
 *  Aujourd'hui un seul cas : un dossier "sinistre" dont l'etape parle de "courrier"
 *  -> ecran generateur de courriers. Si le libelle contient un code courrier-type
 *  reconnu (C1..C9, cf. donnees DDE), on cible ce courrier ; sinon l'index (selecteur).
 *  Le parametre ?dossier=<id> est TOUJOURS passe (l'ecran courrier le consomme). */
export interface ActionEtape {
  kind: "courrier";
  href: string;
  label: string;
}

// Code courrier-type isole en token (ex "C5" dans "Envoyer le courrier C5"), borne
// a C1..C9 (jeu de donnees actuel). \b evite de matcher "C50" ou "ABC5".
const RE_CODE_COURRIER = /\bC[1-9]\b/i;

export function actionEtape(d: Pick<Dossier, "id" | "type">, etape: EtapeDossier): ActionEtape | undefined {
  if (d.type !== "sinistre") return undefined;
  if (!/courrier/i.test(etape.label)) return undefined;
  const code = etape.label.match(RE_CODE_COURRIER)?.[0]?.toUpperCase();
  const base = code ? `/sinistre/courriers/${code}` : "/sinistre/courriers";
  return {
    kind: "courrier",
    href: `${base}?dossier=${encodeURIComponent(d.id)}`,
    label: code ? `Rédiger le courrier ${code}` : "Rédiger le courrier",
  };
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

// --- Segment d'une affaire pour l'accueil "Mes affaires en cours" (variante C) ----
//
// Orientation ACTION (valide Sekou), 3 colonnes : A traiter / En cours / A clore.
// Heuristique v1 (a affiner) - on combine le STATUT du domaine et la PROGRESSION des
// etapes, en restant prudent (on n'invente aucune donnee de "probleme") :
//   - a_clore   : tout est fait (progression 100%, au moins une etape) ET pas deja clos.
//                 -> il ne reste qu'a basculer le statut sur "Clos". Le signal le plus sur.
//   - a_traiter : rien n'a encore demarre = aucune etape faite (0/N, N>=1), OU statut
//                 "ouvert" (pris en main mais pas commence). Une action t'attend.
//   - en_cours  : tout le reste (au moins une etape faite, mais pas tout) + les dossiers
//                 sans etape du tout (rien a derouler -> ni "a traiter" ni "a clore").
// Un dossier "clos" n'apparait pas dans l'accueil (filtre en amont) ; par surete, s'il
// arrive ici il tombe en "en_cours" (jamais "a clore", deja traite).
export type SegmentAffaire = "a_traiter" | "en_cours" | "a_clore";

export const SEGMENT_AFFAIRE_LABEL: Record<SegmentAffaire, string> = {
  a_traiter: "À traiter",
  en_cours: "En cours",
  a_clore: "À clore",
};

export const SEGMENT_AFFAIRE_ORDRE: SegmentAffaire[] = ["a_traiter", "en_cours", "a_clore"];

export function segmentAffaire(d: Pick<Dossier, "statut" | "etapes">): SegmentAffaire {
  const total = d.etapes.length;
  const faites = d.etapes.filter((e) => e.fait).length;

  if (d.statut === "clos") return "en_cours"; // deja traite : jamais propose "a clore"
  if (total > 0 && faites === total) return "a_clore"; // tout fait, reste a clore
  if (faites === 0 && total > 0) return "a_traiter"; // pas commence
  if (d.statut === "ouvert") return "a_traiter"; // pris en main, rien de demarre
  return "en_cours";
}
