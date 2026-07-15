// Port : listes de diffusion Crypto (fallback destinataires du conseil syndical). Permet
// de retrouver les adresses du CS d'une copro quand eStale ne remonte pas d'email (parc
// encore sur Crypto jusqu'a janvier). Ne depend de rien (ADR-001).
//
// La donnee est importee une fois dans intranet_listes_diffusion (cf. scripts/
// import-listes-diffusion.mjs) ; ce port n'expose que la LECTURE cote app.

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
}
