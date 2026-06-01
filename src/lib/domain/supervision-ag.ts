// Domaine de la supervision AG : checklist multi-sections par AG.
// Types metier + helpers purs, zero dependance technique.

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
  commentaire?: string;
  audite?: AuditeurItem;
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

/** Un item est "verifie" des qu'il a quitte l'etat initial. */
export function estVerifie(item: ItemChecklist): boolean {
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

export function progressionGlobale(supervision: SupervisionAg): Progression {
  return calculer(supervision.sections.flatMap((s) => s.items));
}

/** L'AG est concluable s'il n'y a aucun probleme actif, qu'elle est encore
 *  en preparation et que l'utilisateur a le role gestionnaire. */
export function peutConclure(supervision: SupervisionAg, role: Role): boolean {
  if (role !== "gestionnaire") return false;
  if (supervision.statut === "conclue_archivee") return false;
  return !supervision.sections
    .flatMap((s) => s.items)
    .some((i) => i.statut === "probleme");
}
