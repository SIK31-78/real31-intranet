import type {
  ItemProbleme,
  StatutItem,
  SupervisionAg,
  VisaFinal,
} from "@/lib/domain/supervision-ag";

export interface Auditeur {
  initiales: string;
}

export interface SupervisionAgProvider {
  /** managerId : si fourni, ne renvoie la supervision que si la copro appartient au gestionnaire. */
  getSupervision(agId: string, managerId?: string): Promise<SupervisionAg | undefined>;
  setStatutItem(
    agId: string,
    itemId: string,
    statut: StatutItem,
    auditeur: Auditeur,
  ): Promise<SupervisionAg>;
  setCommentaireItem(
    agId: string,
    itemId: string,
    commentaire: string,
    auditeur: Auditeur,
  ): Promise<SupervisionAg>;
  conclureAg(agId: string, visa: VisaFinal): Promise<SupervisionAg>;
  /** Reporte la prepa "sans date" (id = CODE seul) sur la supervision datee
   *  quand une date d'AG est (re)fixee. No-op s'il n'y a rien a reporter. */
  reporterSansDate(coproCode: string, nouvelleDateISO: string): Promise<void>;
  /** Liste les items coches "probleme" sur un ensemble de copros (cloisonnement amont).
   *  Sert au panneau "Problemes" du dashboard et a la page Actions. */
  listerProblemes(coproCodes: string[]): Promise<ItemProbleme[]>;
}
