import type {
  ItemProbleme,
  StatutAg,
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
  /** Statut (conclue ou non) d'un lot d'AG datees, en UNE lecture groupee (evite N appels
   *  getSupervision quand seul le statut compte, ex accueil). Cle = agId "CODE__DATE".
   *  Cloisonnement suppose fait en AMONT (les cles viennent de copros deja scopees).
   *  Toute cle valide demandee est presente dans le resultat (defaut "en_preparation"). */
  getStatuts(agIds: string[]): Promise<Map<string, StatutAg>>;
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
