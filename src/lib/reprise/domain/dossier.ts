// Modele "Dossier de reprise" d'une copropriete — le SUIVI D'EQUIPE d'une reprise.
//
// Refonte 2026-09-09 (ADR-037) : le module n'importe plus rien depuis l'UI, les reprises se font
// au terminal avec le skill `estale-migration`. Le dossier est desormais un TABLEAU DE SUIVI
// PARTAGE : une checklist canonique (les gestes humains d'une reprise, consolides depuis le skill
// et les quatre procedures internes du cabinet), chaque etape ASSIGNEE a une personne, un statut
// « bloque » avec son motif, des etapes AD HOC ajoutees en cours de route.
//
// Pur, testable, aucune I/O. Les etapes vivent dans le JSONB `etapes` de reprise_dossier : tout
// ajout de champ est ADDITIF (retro-compatible avec les dossiers deja persistes).

import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";
import type { CompteAvantRepartition, VerdictRaccordement } from "@/lib/reprise/domain/controle-comptes";
import type { AnnexeAnalysee, ContactRapproche } from "@/lib/reprise/domain/rapprochement-contacts";

/** Phases d'une reprise, dans l'ordre chronologique. */
export const PHASES = [
  "CADRAGE",
  "DOCUMENTS",
  "BANQUE",
  "COMMUNICATION",
  "PATRIMOINE",
  "COMPTABILITE",
  "EXPLOITATION",
  "CLOTURE",
] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABEL: Record<Phase, string> = {
  CADRAGE: "Cadrage",
  DOCUMENTS: "Documents",
  BANQUE: "Banque",
  COMMUNICATION: "Communication",
  PATRIMOINE: "Patrimoine",
  COMPTABILITE: "Comptabilité",
  EXPLOITATION: "Exploitation",
  CLOTURE: "Clôture",
};

/** Anciennes phases (dossiers persistes avant la refonte) -> phase courante la plus proche. */
const ANCIENNES_PHASES: Record<string, Phase> = {
  OFFRE: "CADRAGE",
  VERIFICATION: "PATRIMOINE",
  MISE_EN_SERVICE: "EXPLOITATION",
};

/**
 * Roles d'une reprise. Le « referent » est la personne qui conduit la reprise au terminal avec le
 * skill (aujourd'hui Sekou) ; les trois autres sont les metiers du cabinet. Un role sert de
 * DEFAUT d'assignation : renseigner l'equipe du dossier assigne d'un coup toutes les etapes du role.
 */
export const ROLES_REPRISE = ["referent", "gestionnaire", "assistant", "comptable"] as const;
export type RoleReprise = (typeof ROLES_REPRISE)[number];

export const ROLE_LABEL: Record<RoleReprise, string> = {
  referent: "Référent reprise",
  gestionnaire: "Gestionnaire",
  assistant: "Assistant(e)",
  comptable: "Comptable",
};

/** Une personne assignee : id technique (public."User".id) + nom affichable (denormalise). */
export interface Personne {
  id: string;
  nom: string;
}

/** Equipe d'un dossier : qui tient chaque role. Partielle tant que le cadrage n'est pas fait. */
export type EquipeReprise = Partial<Record<RoleReprise, Personne>>;

/** `bloque` = l'etape ne peut pas avancer ; le motif est dans `note`. */
export type StatutEtape = "a_faire" | "en_cours" | "bloque" | "fait" | "ignore";

/** Statut global du dossier (historique ; l'affichage se derive desormais de la phase courante). */
export type StatutDossier =
  | "offre"
  | "production"
  | "verification"
  | "comptabilite"
  | "finalisation"
  | "termine";

export interface Etape {
  /** Code stable (ex. "BA3"). Une etape ad hoc porte un code "X-<n>" genere. */
  code: string;
  phase: Phase;
  libelle: string;
  statut: StatutEtape;
  /** Role par defaut (canonique) ; sert a l'assignation en masse. */
  role?: RoleReprise;
  /** Personne assignee (ecrase le defaut du role). */
  assigneA?: Personne;
  /** Motif de blocage, ou commentaire libre. Visible sur le tableau d'equipe. */
  note?: string;
  /** Echeance souhaitee, ISO date (AAAA-MM-JJ). */
  echeance?: string;
  /** true = ajoutee en cours de reprise pour ce dossier ; jamais abandonnee a la reconciliation. */
  adHoc?: boolean;
  /** Pour une etape ad hoc : le code de l'etape canonique apres laquelle elle s'affiche. */
  apresCode?: string;
  /** Derniere modification (ISO) et son auteur (nom), fournis par l'appelant. */
  majLe?: string;
  majPar?: string;
}

/** Resume de la reprise comptable (grand livre) : present si un grand livre a ete analyse. */
export interface ComptaResume {
  /** true si le grand livre est equilibre (total debit == total credit). */
  equilibre: boolean;
  /** Ecart signe totalDebit - totalCredit. */
  ecart: number;
  /** Nombre de comptes source distincts. */
  nbComptes: number;
  /** Nombre d'ecritures extraites. */
  nbEcritures: number;
  /**
   * Comptes de classe 6/7 avec report a-nouveau non nul. Present/non vide seulement si detecte.
   * Sur le GL cloture = signature "avant repartition" (bloquant) ; sur le GL en cours = anomalie
   * (reports 6/7 doivent repartir a zero). Persiste dans le JSONB `compteurs` (ADDITIF, zero
   * migration) pour rehydrater l'alerte du recap. PII-free.
   */
  avantRepartition?: CompteAvantRepartition[];
}

/** Compteurs du dossier (alignes sur le frontmatter des fiches S0XXX). */
export interface CompteursDossier {
  nbLots?: number;
  nbCles?: number;
  nbCoproprietaires?: number;
  nbAttributions?: number;
  nbAnomalies?: number;
  nbFusionsEffectuees?: number;
  /** Resume compta de l'exercice CLOTURE (historique, renseigne par l'ancienne analyse UI). */
  compta?: ComptaResume;
  /** Resume compta de l'exercice EN COURS (historique). */
  comptaEnCours?: ComptaResume;
  /** Verdict du controle croise cloture <-> en cours (historique). */
  raccordement?: VerdictRaccordement;
  /** Erreur d'extraction du grand livre (historique). */
  comptaErreur?: string;
  /**
   * Dossier ARCHIVE (reversible) : masque de la liste par defaut, reste consultable en lecture.
   * Loge dans le JSONB `compteurs` (ADDITIF, ZERO SQL, retro-compatible : absent = actif).
   */
  archive?: boolean;
  /** Documents annexes analyses (historique). */
  annexes?: AnnexeAnalysee[];
  /** Contacts rapproches aux owners (historique, PII : ne quitte jamais cette ligne vers un log). */
  contactsAnnexes?: ContactRapproche[];
}

export interface EntreeJournal {
  /** ISO date (fournie par l'appelant : pas d'horloge dans le domaine pur). */
  date: string;
  texte: string;
  /** Nom de l'auteur (fourni par l'appelant). Absent sur les entrees anterieures a la refonte. */
  auteur?: string;
}

export interface Dossier {
  /** Reference eStale, ex. "S0302". */
  ref: string;
  nomUsuel: string;
  /** Adresse de l'immeuble (saisie a la creation, optionnelle). */
  adresse?: string;
  statut: StatutDossier;
  etapes: Etape[];
  compteurs: CompteursDossier;
  /** Anomalies actionnables (saisies manuelles ; historique de l'orchestrateur). */
  anomalies: string[];
  journal: EntreeJournal[];
  /** Syndic sortant (nom usuel), pour le tableau d'equipe. */
  sortant?: string;
  /** Date de bascule (date d'effet du mandat), ISO date. */
  dateBascule?: string;
  /** Qui tient chaque role sur ce dossier. */
  equipe?: EquipeReprise;
  /** Jeu de donnees extrait par l'ancienne analyse UI (historique, conserve tel quel). */
  jeu?: JeuDeDonnees;
}

/**
 * CHECKLIST CANONIQUE = les gestes HUMAINS d'une reprise, dans l'ordre. Consolidee le 09/09/2026
 * depuis le skill `estale-migration` (docs/reprise/CHECKLIST-REPRISE.md, 89 lignes dont les
 * controles automatises restent au skill) et les quatre procedures internes du cabinet
 * (docs/reprise/*.docx, *.pdf). Une case cochee = fait ET verifie.
 *
 * Les codes sont STABLES : ne jamais les renumeroter (l'etat coche vit en JSONB). L'ordre
 * d'affichage = l'ordre de ce tableau. Le `role` est le defaut d'assignation.
 */
export const ETAPES_REPRISE: ReadonlyArray<{ code: string; phase: Phase; libelle: string; role: RoleReprise }> = [
  // ---- CADRAGE
  { code: "CA1", phase: "CADRAGE", role: "gestionnaire", libelle: "Rendez-vous avec le syndic sortant : remise des archives et des dossiers en cours (contentieux, travaux, sinistres, ventes), PV de remise daté" },
  { code: "CA2", phase: "CADRAGE", role: "gestionnaire", libelle: "Date de bascule, périmètre (patrimoine + compta ou compta seule) et chaîne des syndics écrits au dossier" },
  { code: "CA3", phase: "CADRAGE", role: "gestionnaire", libelle: "Équipe nommée : gestionnaire, assistant(e), comptable, référent reprise" },
  { code: "CA4", phase: "CADRAGE", role: "assistant", libelle: "Compte bancaire : le compte séparé au nom du syndicat est-il conservé (même RIB) ou faut-il en ouvrir un ? Confirmé auprès de la banque" },
  { code: "CA5", phase: "CADRAGE", role: "gestionnaire", libelle: "Âge de l'immeuble et fonds de travaux ALUR (dispense si moins de 5 ans après réception) ; assurance multirisque identifiée" },
  { code: "CA6", phase: "CADRAGE", role: "referent", libelle: "État eStale relevé (exercices, clés et tantièmes réels, plan comptable, fournisseurs de l'annuaire, gestion courante déjà saisie)" },
  // ---- DOCUMENTS
  { code: "DO1", phase: "DOCUMENTS", role: "gestionnaire", libelle: "Pièces de nomination : PV d'AG nommant le cabinet, feuille de présence, contrat de syndic signé, règlement de copropriété" },
  { code: "DO2", phase: "DOCUMENTS", role: "gestionnaire", libelle: "Grands livres N-1 (après répartition) et N jusqu'à la bascule — un fichier par exercice, Excel de préférence" },
  { code: "DO3", phase: "DOCUMENTS", role: "gestionnaire", libelle: "RGD de chaque exercice, balance à la date de bascule, journaux du sortant si possible" },
  { code: "DO4", phase: "DOCUMENTS", role: "gestionnaire", libelle: "Appels de fonds du sortant (tous les trimestres), annexes de convocation (1 bis, 3, 5), PV antérieurs, récap d'AG" },
  { code: "DO5", phase: "DOCUMENTS", role: "gestionnaire", libelle: "Situations de compte individuelles, décomptes de compteurs du prestataire, factures fournisseurs, contrats en cours" },
  { code: "DO6", phase: "DOCUMENTS", role: "gestionnaire", libelle: "EDD + RCP et tous les modificatifs, fiche synthèse du registre national, liste des résidents" },
  { code: "DO7", phase: "DOCUMENTS", role: "gestionnaire", libelle: "Réclamation art. 18-2 au sortant pour ce qui manque (fonds et relevés sous 1 mois, état des comptes sous 2 mois)" },
  // ---- BANQUE
  { code: "BA1", phase: "BANQUE", role: "assistant", libelle: "Dossier d'ouverture de compte remis à la banque (PV de nomination, RCP, contrat de syndic) — ou compte existant identifié" },
  { code: "BA2", phase: "BANQUE", role: "assistant", libelle: "IBAN reçu" },
  { code: "BA3", phase: "BANQUE", role: "assistant", libelle: "ICS reçu et émetteur SEPA paramétré dans eStale (donneur d'ordre « SDC … – REAL 31 ») — sans lui, aucun prélèvement" },
  { code: "BA4", phase: "BANQUE", role: "assistant", libelle: "Livret A / compte rémunéré ouvert ou rapatrié (fonds de travaux)" },
  { code: "BA5", phase: "BANQUE", role: "assistant", libelle: "Banque à distance : copropriété créée, droits des utilisateurs, connexion bancaire eStale active" },
  { code: "BA6", phase: "BANQUE", role: "assistant", libelle: "Ancienne banque contactée : prélèvements et virements du sortant arrêtés, solde et livret à rapatrier" },
  { code: "BA7", phase: "BANQUE", role: "comptable", libelle: "Virement du sortant contrôlé (= solde du compte d'attente) — ou OD « Récupération gestion banque » si le compte est conservé" },
  // ---- COMMUNICATION
  { code: "CO1", phase: "COMMUNICATION", role: "gestionnaire", libelle: "Courrier / mail à tous les copropriétaires : changement de syndic, présentation, mandat de prélèvement SEPA, extranet" },
  { code: "CO2", phase: "COMMUNICATION", role: "assistant", libelle: "Courrier / mail à tous les fournisseurs et prestataires : changement de syndic, adresse de facturation, RIB, accès extranet récupérés" },
  { code: "CO3", phase: "COMMUNICATION", role: "gestionnaire", libelle: "Assurance : avenant de changement de syndic sur la multirisque, sinistres en cours repris" },
  // ---- PATRIMOINE
  { code: "PA1", phase: "PATRIMOINE", role: "referent", libelle: "Modificatifs d'EDD lus ; lots, clés, tantièmes, copropriétaires extraits et validés (auto-checks à 0 erreur)" },
  { code: "PA2", phase: "PATRIMOINE", role: "referent", libelle: "Patrimoine importé dans eStale (lots → clés → tantièmes → copropriétaires → liens) et contrôlé" },
  { code: "PA3", phase: "PATRIMOINE", role: "referent", libelle: "Attributions vérifiées contre le dernier appel de fonds et le dossier Ventes ; corrections faites" },
  // ---- COMPTABILITE
  { code: "CP1", phase: "COMPTABILITE", role: "referent", libelle: "Extraction et contrôles d'entrée : filets n°1 et n°2, RGD par poste, répartition du sortant localisée" },
  { code: "CP2", phase: "COMPTABILITE", role: "referent", libelle: "Mapping tranché (fournisseurs par SIREN, comptes, copropriétaires par nom, travaux, partis) ; auto-checks compta à 0 ; classeur de mapping livré" },
  { code: "CP3", phase: "COMPTABILITE", role: "referent", libelle: "Gestes eStale préalables : exercice N-1, fournisseurs, comptes, opérations de travaux, compteurs" },
  { code: "CP4", phase: "COMPTABILITE", role: "referent", libelle: "Exercice N-1 importé et éclaté, balance à 0, conforme au sortant compte par compte" },
  { code: "CP5", phase: "COMPTABILITE", role: "referent", libelle: "Exercice N-1 verrouillé, comptes copropriétaires alignés sur le décompte approuvé (OD), clôturé à la date de l'AG" },
  { code: "CP6", phase: "COMPTABILITE", role: "referent", libelle: "Exercice N importé, contrôle de sortie à la bascule, rapprochement bancaire jusqu'à ce jour" },
  { code: "CP7", phase: "COMPTABILITE", role: "comptable", libelle: "Comptes d'attente et copropriétaires partis soldés" },
  { code: "CP8", phase: "COMPTABILITE", role: "referent", libelle: "Récapitulatif et mail de fin de reprise rendus à la gestionnaire" },
  // ---- EXPLOITATION
  { code: "EX1", phase: "EXPLOITATION", role: "referent", libelle: "Dernier PV dépouillé ; budgets N (révisé) et N+1 saisis ; échéanciers de rattrapage" },
  { code: "EX2", phase: "EXPLOITATION", role: "referent", libelle: "Fonds ALUR (si voté), opérations de travaux (montant voté), honoraires" },
  { code: "EX3", phase: "EXPLOITATION", role: "comptable", libelle: "Compteurs d'eau complétés avant tout appel de fonds" },
  { code: "EX4", phase: "EXPLOITATION", role: "gestionnaire", libelle: "Fiches de renseignements générées et envoyées à chaque copropriétaire" },
  { code: "EX5", phase: "EXPLOITATION", role: "gestionnaire", libelle: "Appels de fonds émis et envoyés (texte et PDF relus) avec extraits de compte et répartition N-1 (« ne pas régler au sortant »)" },
  { code: "EX6", phase: "EXPLOITATION", role: "assistant", libelle: "Retours des fiches traités : e-mails, RIB, LRE, espaces extranet ouverts" },
  { code: "EX7", phase: "EXPLOITATION", role: "gestionnaire", libelle: "Débiteurs relancés, factures fournisseurs en attente réglées" },
  { code: "EX8", phase: "EXPLOITATION", role: "assistant", libelle: "Documents du sortant versés sur l'extranet ; contrats scannés et enregistrés (carnet d'entretien)" },
  { code: "EX9", phase: "EXPLOITATION", role: "assistant", libelle: "Registre national des copropriétés mis à jour (changement de syndic)" },
  { code: "EX10", phase: "EXPLOITATION", role: "assistant", libelle: "Facturation des honoraires du cabinet paramétrée (Pennylane)" },
  // ---- CLOTURE
  { code: "CL1", phase: "CLOTURE", role: "referent", libelle: "Dossier de travail archivé dans reprise/<REF>/ et skill mis à jour" },
  { code: "CL2", phase: "CLOTURE", role: "gestionnaire", libelle: "Première AG : comptes de tout l'exercice repris présentés ; écart de reprise inscrit à l'ordre du jour si besoin" },
  { code: "CL3", phase: "CLOTURE", role: "gestionnaire", libelle: "Clôture de la reprise" },
];

/**
 * Anciens codes (checklist R* de 2026-07) -> code canonique qui porte le meme geste. Un ancien
 * code coche reporte son statut sur le nouveau ; a defaut de correspondance, l'ancienne etape est
 * conservee telle quelle si elle porte de l'information (jamais de perte d'etat coche).
 */
export const CORRESPONDANCE_ANCIENS_CODES: Readonly<Record<string, string>> = {
  R1: "DO2",
  R2: "PA1",
  R3: "PA2",
  R4: "PA3",
  R5: "EX4",
  RB1: "BA1",
  RB2: "BA5",
  R6: "CP1",
  RG1: "CP1",
  R7: "CP2",
  R8: "CP4",
  R9: "CP6",
  RD1: "EX8",
  R10: "EX6",
  R11: "CL3",
};

const RANG_STATUT: Record<StatutEtape, number> = { a_faire: 0, ignore: 1, en_cours: 2, bloque: 3, fait: 4 };

/** Checklist par defaut d'un nouveau dossier (toutes a_faire), assignee d'apres l'equipe si fournie. */
export function etapesParDefaut(equipe?: EquipeReprise): Etape[] {
  return ETAPES_REPRISE.map((e) => {
    const p = equipe?.[e.role];
    return { ...e, statut: "a_faire" as StatutEtape, ...(p ? { assigneA: p } : {}) };
  });
}

/**
 * RECONCILIATION retro-compatible des etapes persistees avec la checklist COURANTE.
 *   - repart de la checklist canonique (toutes a_faire) ;
 *   - une etape persistee au code canonique reporte tout son etat (statut, assignee, note...) ;
 *   - un ANCIEN code connu (R*) reporte son statut sur son correspondant — sans ecraser un statut
 *     plus avance deja porte par le nouveau code ;
 *   - une etape AD HOC est TOUJOURS conservee, quel que soit son statut ;
 *   - une ancienne etape inconnue (P/V/C du vault) est conservee si elle porte de l'information
 *     (statut != a_faire), sa phase traduite vers une phase courante.
 * Idempotente. L'ordre de sortie : canonique, chaque ad hoc juste apres son `apresCode` (ou en fin
 * de sa phase), les anciennes en fin.
 */
export function reconcilierEtapes(persistees: Etape[]): Etape[] {
  const canon = etapesParDefaut();
  const parCode = new Map(canon.map((e) => [e.code, e]));
  const adHoc: Etape[] = [];
  const legacy: Etape[] = [];
  for (const e of persistees) {
    if (e.adHoc) {
      adHoc.push({ ...e, phase: traduirePhase(e.phase) });
      continue;
    }
    const cible = parCode.get(e.code);
    if (cible) {
      Object.assign(cible, e, { phase: cible.phase, libelle: cible.libelle, role: cible.role });
      continue;
    }
    const nouveau = CORRESPONDANCE_ANCIENS_CODES[e.code];
    const cibleNouvelle = nouveau ? parCode.get(nouveau) : undefined;
    if (cibleNouvelle) {
      if (RANG_STATUT[e.statut] > RANG_STATUT[cibleNouvelle.statut]) cibleNouvelle.statut = e.statut;
      continue;
    }
    if (e.statut !== "a_faire") legacy.push({ ...e, phase: traduirePhase(e.phase) });
  }
  return [...insererAdHoc(canon, adHoc), ...legacy];
}

function traduirePhase(p: string): Phase {
  return (PHASES as readonly string[]).includes(p) ? (p as Phase) : (ANCIENNES_PHASES[p] ?? "EXPLOITATION");
}

function insererAdHoc(canon: Etape[], adHoc: Etape[]): Etape[] {
  const out = [...canon];
  for (const a of adHoc) {
    let idx = a.apresCode ? out.findIndex((e) => e.code === a.apresCode) : -1;
    if (idx < 0) {
      // en fin de sa phase (derniere etape de cette phase), sinon en fin de liste
      for (let i = out.length - 1; i >= 0; i--) if (out[i].phase === a.phase) { idx = i; break; }
    }
    out.splice(idx + 1, 0, a);
  }
  return out;
}

/** Prochain code libre pour une etape ad hoc : "X-1", "X-2"... (stable, jamais reutilise). */
export function prochainCodeAdHoc(etapes: Etape[]): string {
  const max = etapes.reduce((m, e) => {
    const n = /^X-(\d+)$/.exec(e.code);
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
  return `X-${max + 1}`;
}

/** Ajoute une etape ad hoc (retourne une nouvelle liste, l'ordre est recalcule par la reconciliation). */
export function ajouterEtapeAdHoc(
  etapes: Etape[],
  saisie: { phase: Phase; libelle: string; apresCode?: string; assigneA?: Personne; echeance?: string },
): Etape[] {
  const nouvelle: Etape = {
    code: prochainCodeAdHoc(etapes),
    phase: saisie.phase,
    libelle: saisie.libelle.trim(),
    statut: "a_faire",
    adHoc: true,
    ...(saisie.apresCode ? { apresCode: saisie.apresCode } : {}),
    ...(saisie.assigneA ? { assigneA: saisie.assigneA } : {}),
    ...(saisie.echeance ? { echeance: saisie.echeance } : {}),
  };
  return reconcilierEtapes([...etapes, nouvelle]);
}

/**
 * Assigne d'apres l'equipe toutes les etapes d'un role qui n'ont PAS d'assignee explicite (ou
 * `forcer` = toutes). Retourne une nouvelle liste.
 */
export function assignerParRole(etapes: Etape[], equipe: EquipeReprise, forcer = false): Etape[] {
  return etapes.map((e) => {
    const p = e.role ? equipe[e.role] : undefined;
    if (!p) return e;
    if (e.assigneA && !forcer) return e;
    return { ...e, assigneA: p };
  });
}

/**
 * L'etape COURANTE du dossier, celle que le tableau d'equipe met en avant :
 * la premiere `bloque`, sinon la premiere `en_cours`, sinon la premiere `a_faire`.
 * undefined quand tout est fait ou ignore.
 */
export function etapeCourante(etapes: Etape[]): Etape | undefined {
  return (
    etapes.find((e) => e.statut === "bloque") ??
    etapes.find((e) => e.statut === "en_cours") ??
    etapes.find((e) => e.statut === "a_faire")
  );
}

/** Phase de l'etape courante (undefined = reprise terminee). */
export function phaseCourante(etapes: Etape[]): Phase | undefined {
  return etapeCourante(etapes)?.phase;
}

/** Cree un dossier neuf avec la checklist canonique, assignee d'apres l'equipe si fournie. */
export function creerDossier(
  ref: string,
  nomUsuel: string,
  adresse?: string,
  options?: { sortant?: string; dateBascule?: string; equipe?: EquipeReprise },
): Dossier {
  return {
    ref,
    nomUsuel,
    ...(adresse ? { adresse } : {}),
    statut: "production",
    etapes: etapesParDefaut(options?.equipe),
    compteurs: {},
    anomalies: [],
    journal: [],
    ...(options?.sortant ? { sortant: options.sortant } : {}),
    ...(options?.dateBascule ? { dateBascule: options.dateBascule } : {}),
    ...(options?.equipe ? { equipe: options.equipe } : {}),
  };
}

/** true si le dossier est archive (masque de la liste par defaut, lecture seule). */
export function estArchive(dossier: Dossier): boolean {
  return dossier.compteurs.archive === true;
}

/** Avancement (0..1) = part des etapes "fait" ou "ignore" sur le total. */
export function avancement(dossier: Dossier): number {
  if (dossier.etapes.length === 0) return 0;
  const faites = dossier.etapes.filter((e) => e.statut === "fait" || e.statut === "ignore").length;
  return faites / dossier.etapes.length;
}
