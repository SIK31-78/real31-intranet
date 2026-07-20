// Port : listes de diffusion Crypto (fallback destinataires du conseil syndical). Permet
// de retrouver les adresses du CS d'une copro quand eStale ne remonte pas d'email (parc
// encore sur Crypto jusqu'a janvier). Ne depend de rien (ADR-001).
//
// La donnee est importee une fois dans intranet_listes_diffusion (cf. scripts/
// import-listes-diffusion.mjs) ; ce port expose la LECTURE et, depuis l'increment
// "editer la liste de diffusion du conseil syndical", l'ECRITURE de la liste CS (secours).

/** Une liste "conseil syndical" rapprochee d'une copro. */
export interface ListeCSCopro {
  /** Reference copro normalisee (ex "S46") ayant servi au rapprochement. */
  coproCode: string;
  /** Designation d'origine de la liste (ex "Conseil Syndical - S046"). */
  designation: string;
  /** Adresses destinataires nettoyees (internes REAL31 exclues, dedupliquees). */
  emails: string[];
}

export interface ListesDiffusionProvider {
  /**
   * Liste "conseil syndical" rapprochee du code copro donne, ou null si aucune (ou table
   * absente / non importee). Le code est normalise cote adapter. Lecture seule.
   */
  listeCSPourCopro(coproCode: string): Promise<ListeCSCopro | null>;

  /**
   * Remplace la liste de SECOURS "conseil syndical" de la copro par `emails` (deja
   * valides / dedupliques cote domaine). Upsert sur la ligne (copro_code, 'conseil_syndical')
   * et pose un marqueur d'edition manuelle (edite_le) pour la proteger d'un rejeu d'import.
   *
   * Cette liste reste le SECOURS : la cascade des destinataires du mail CS prend eStale en
   * priorite (cf. destinataires-conseil.ts). Editer ici ne change le mail que si eStale ne
   * fournit aucun email de conseil pour cette copro.
   *
   * Leve une erreur si la persistance est indisponible (table ou colonne absente) : c'est
   * un etat a corriger, catche cote server action pour ne pas casser l'UI.
   */
  remplacerListeCS(coproCode: string, emails: string[]): Promise<void>;
}
