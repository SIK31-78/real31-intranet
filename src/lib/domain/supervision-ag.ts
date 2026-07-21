// Domaine de la supervision AG : checklist multi-sections par AG.
// Types metier + helpers purs, zero dependance technique.

/** Code copro porte par un id de supervision "CODE__YYYY-MM-DD" (ou "CODE"/"e1" simple). */
export function coproCodeDeAgId(agId: string): string {
  const i = agId.indexOf("__");
  return i < 0 ? agId : agId.slice(0, i);
}

/** Date d'AG portee par un id de supervision "CODE__YYYY-MM-DD" ; null si l'id n'en a pas. */
export function agDateDeAgId(agId: string): string | null {
  const i = agId.indexOf("__");
  const date = i < 0 ? "" : agId.slice(i + 2);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export type StatutItem = "non_verifie" | "ok" | "probleme" | "non_applicable";

export type StatutAg = "en_preparation" | "conclue_archivee";

/** Role MVP : permissions UI-only (cf. ADR-009 a venir pour la vraie matrice). */
export type Role = "gestionnaire" | "assistant" | "lecture";

export interface AuditeurItem {
  /** Initiales de l'auteur du dernier changement, ex "EL". */
  initiales: string;
  /** Horodatage ISO du dernier changement. */
  le: string;
}

export interface ItemChecklist {
  /** Slug stable, partage entre AG, ex "log.date-ag-confirmee". */
  id: string;
  libelle: string;
  statut: StatutItem;
  /** "date" = champ date (valeur ISO stockee dans commentaire) ; sinon case a cocher. */
  type?: "check" | "date";
  commentaire?: string;
  audite?: AuditeurItem;
  /** Lien externe vers l'app metier concernee (Registre des mandats...). */
  lien?: string;
  /** Ouvre un module interne EN MODALE (recap AG / depassement CS) au lieu d'un lien
   *  externe : le bouton "ouvrir" declenche une modale pre-scopee a la copro. */
  module?: "recap" | "depassement_cs";
}

export interface SectionChecklist {
  id: string;
  titre: string;
  items: ItemChecklist[];
}

export interface VisaFinal {
  initiales: string;
  /** Date courte, ex "12/05/2026". */
  le: string;
}

export interface SupervisionAg {
  id: string;
  copro: { code: string; nomCourt: string };
  /** Date AG cible affichee, ex "28/05/2026". */
  dateAgCible: string;
  statut: StatutAg;
  visa?: VisaFinal;
  sections: SectionChecklist[];
}

// --- Problemes signales (item coche "probleme") : remontent au dashboard + Actions ---

/** Un item de supervision en "probleme", brut (sortie du provider). */
export interface ItemProbleme {
  coproCode: string;
  /** Date de l'AG, ISO "YYYY-MM-DD" (ou sentinelle "0001-01-01" si AG sans date). */
  agDate: string;
  itemId: string;
  commentaire?: string;
  marquePar?: string;
  /** Horodatage ISO du marquage. */
  marqueAt?: string;
}

/** Un probleme, pret a afficher (libelle resolu + lien vers la supervision). */
export interface ProblemeVue {
  /** Id de supervision "CODE__DATE" (ou "CODE" si sans date) -> /supervision-ag/[agId]. */
  agId: string;
  itemLibelle: string;
  commentaire?: string;
  par?: string;
  le?: string;
}

/** Les problemes d'une copro, groupes (decision Sekou : regroupes par copropriete). */
export interface ProblemesCopro {
  coproCode: string;
  coproNom: string;
  items: ProblemeVue[];
}

/** Un item est "verifie" des qu'il a quitte l'etat initial. Un item "date" l'est
 *  des qu'une date est renseignee. */
export function estVerifie(item: ItemChecklist): boolean {
  if (item.type === "date") return Boolean(item.commentaire);
  return item.statut !== "non_verifie";
}

export interface Progression {
  verifies: number;
  total: number;
  /** Entier 0-100. */
  pourcentage: number;
}

function calculer(items: ItemChecklist[]): Progression {
  const total = items.length;
  const verifies = items.filter(estVerifie).length;
  return {
    verifies,
    total,
    pourcentage: total === 0 ? 0 : Math.round((verifies / total) * 100),
  };
}

export function progressionSection(section: SectionChecklist): Progression {
  return calculer(section.items);
}

/** Une phase (section) est TERMINEE pour le parcours par paliers quand tous ses items
 *  sont traites (OK / N/A / date renseignee) ET qu'aucun n'est en "probleme". Plus
 *  strict que progressionSection (qui, elle, compte un "probleme" comme verifie).
 *  Sert a savoir si la phase suivante se deverrouille. */
export function phaseTerminee(section: SectionChecklist): boolean {
  return section.items.every((i) => estVerifie(i) && i.statut !== "probleme");
}

export function progressionGlobale(supervision: SupervisionAg): Progression {
  return calculer(supervision.sections.flatMap((s) => s.items));
}

/** L'AG est concluable si le dossier est COMPLET (tous les items traites), sans
 *  probleme actif, encore en preparation, et l'utilisateur a le role gestionnaire.
 *  (Avant : seul un probleme bloquait -> on pouvait conclure une checklist vide.) */
export function peutConclure(supervision: SupervisionAg, role: Role): boolean {
  if (role !== "gestionnaire") return false;
  if (supervision.statut === "conclue_archivee") return false;
  const items = supervision.sections.flatMap((s) => s.items);
  if (items.some((i) => i.statut === "probleme")) return false;
  return items.every(estVerifie);
}
