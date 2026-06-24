// Port : etat de traitement du cockpit "Mes emails", persiste et cloisonne par
// gestionnaire. Le triage (mails + propositions) vient d'un autre port ; ici on ne
// stocke QUE ce que le gestionnaire a fait (statut, etapes cochees, brouillon edite,
// rattachement override). Ne depend que du domaine (ADR-001).

import type { Rattachement, StatutTraitement } from "@/lib/domain/mes-emails";

/** Etat persiste d'un mail, pour un gestionnaire donne. */
export interface EtatMail {
  emailId: string;
  statut: StatutTraitement;
  etapesFaites: number[];
  lu: boolean;
  /** Reponse editee a la main (absent = proposition de l'assistant gardee). */
  brouillon?: string;
  /** Dossier choisi a la main (absent = rattachement propose garde). */
  rattachement?: Rattachement;
  /** Copropriete rattachee a la main (absent = attribution auto gardee). */
  coproCode?: string;
  coproNom?: string;
}

/** Cle commune a toutes les ecritures. `initiales` = trace de l'auteur. */
export type CleEtat = {
  gestionnaireId: string;
  emailId: string;
  coproCode: string;
  initiales: string;
};

export type MajStatut = CleEtat & { statut: StatutTraitement; etapesFaites: number[]; brouillon?: string };
export type MajEtapes = CleEtat & { etapesFaites: number[] };
export type MajBrouillon = CleEtat & { brouillon: string };
export type MajRattachement = CleEtat & { rattachement: Rattachement };
export type MajCopro = CleEtat & { coproNom: string };

export interface MesEmailsEtatRepository {
  /** Tous les etats d'un gestionnaire (cle emailId). */
  getEtats(gestionnaireId: string): Promise<EtatMail[]>;
  /** Valider/devalider : pose le statut + les etapes (+ le brouillon final si fourni). */
  setStatut(p: MajStatut): Promise<void>;
  setEtapes(p: MajEtapes): Promise<void>;
  setLu(p: CleEtat): Promise<void>;
  setBrouillon(p: MajBrouillon): Promise<void>;
  setRattachement(p: MajRattachement): Promise<void>;
  /** Rattache le mail a une copropriete a la main (coproCode de la cle = la copro). */
  setCopro(p: MajCopro): Promise<void>;
}
