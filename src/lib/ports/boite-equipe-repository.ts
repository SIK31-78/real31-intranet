// Port de la boîte d'équipe de l'écran E-mails (ADR-053, 29/10/2026) : attribution d'un mail,
// notes internes, en attente / de côté / relance. Tables `intranet_mail_attribution` (+ son
// historique), `intranet_mail_note`, `intranet_mail_attente`
// (supabase/sql/intranet_mail_equipe.sql). Ne dépend que du domaine.
//
// SQL pas encore passé : les lectures rendent null (l'app tourne sans la boîte d'équipe,
// signalé une fois dans les journaux), les écritures lèvent BoiteEquipeInactive (message
// métier, montré tel quel).

import type {
  Attente,
  Attribution,
  CleMail,
  LigneHistoriqueAttribution,
  NoteInterne,
} from "@/lib/domain/boite-equipe";

export class BoiteEquipeInactive extends Error {
  constructor() {
    super("Attribution, notes et attente ne sont pas encore activées : une mise à jour de la base est à passer.");
    this.name = "BoiteEquipeInactive";
  }
}

export type NouvelleNote = Omit<NoteInterne, "id" | "creeLe" | "modifieLe">;

export interface BoiteEquipeRepository {
  // --- Attribution : une ligne par (mail, boîte), et un historique qu'on ne réécrit pas.
  /** Les attributions de ces mails (toutes boîtes : l'appelant filtre). null = table absente. */
  attributions(internetMessageIds: string[]): Promise<Attribution[] | null>;
  /** Pose (ou remplace) l'attribution et écrit la ligne d'historique. */
  attribuer(a: Attribution): Promise<void>;
  /**
   * Pose l'attribution seulement s'il n'y en a aucune pour ce (mail, boîte) : true si posée.
   * Sert à l'attribution automatique à la réponse (deux réponses simultanées : la première gagne).
   */
  attribuerSiLibre(a: Attribution): Promise<boolean>;
  /** Retire l'attribution (s'il y en a une) et écrit la ligne d'historique. */
  retirerAttribution(cle: CleMail, h: { dossierCle: string | null; parEmail: string; le: string }): Promise<void>;
  /** L'historique d'un (mail, boîte), du plus récent au plus ancien. null = table absente. */
  historiqueAttribution(cle: CleMail, max: number): Promise<LigneHistoriqueAttribution[] | null>;

  // --- Notes internes : suivent le mail partout (clé = internetMessageId seul).
  /** Les notes d'un mail. null = table absente. */
  notes(internetMessageId: string): Promise<NoteInterne[] | null>;
  /** Le nombre de notes de chacun de ces mails (absent = 0). null = table absente. */
  compterNotes(internetMessageIds: string[]): Promise<Map<string, number> | null>;
  note(id: string): Promise<NoteInterne | null>;
  ajouterNote(n: NouvelleNote): Promise<NoteInterne>;
  modifierNote(id: string, texte: string, le: string): Promise<void>;
  supprimerNote(id: string): Promise<void>;

  // --- En attente / de côté / relance : une ligne par (mail, boîte).
  /** Les attentes de ces mails (toutes boîtes : l'appelant filtre). null = table absente. */
  attentes(internetMessageIds: string[]): Promise<Attente[] | null>;
  /** Les relances (mails envoyés) posées dans ces boîtes. null = table absente. */
  relances(boites: string[]): Promise<Attente[] | null>;
  /** Pose ou remplace l'attente de ce (mail, boîte). */
  poserAttente(a: Attente): Promise<void>;
  /** Lève l'attente (« Reprendre ») ; sans attente, rien. */
  leverAttente(cle: CleMail): Promise<void>;
}
