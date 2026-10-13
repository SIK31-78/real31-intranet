// Port d'ingestion de mail : recupere les mails recents d'une boite. En reel,
// adapter Graph delegue (la boite du gestionnaire connecte) ; en test, adapter
// echantillon. Ne depend que du domaine.

import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";

export interface OptionsIngestion {
  /** Adresse de la boite a lire ; inutile en delegue (/me), utile en app-only. */
  email?: string;
  /** Nombre max de mails recents a remonter. */
  max: number;
  /** Seulement les mails recus a partir de cette date (ISO) : la mise en service du tri. */
  depuis?: string;
  /**
   * Lire un SOUS-DOSSIER precis au lieu de la boite de reception : l'id Graph du dossier.
   * Sert a /mes-emails sur une boite partagee = seulement le dossier du binome du
   * gestionnaire (les mails que le tri lui a distribues), pas toute la reception.
   */
  folderId?: string;
}

export interface MailIngestionProvider {
  lireRecents(opts: OptionsIngestion): Promise<RawMail[]>;
  /**
   * Lit des mails PRECIS de la boite, par internetMessageId (stable : il survit aux
   * deplacements), ou qu'ils soient. Sert a /mes-emails : les mails que le tri a distribues
   * au binome du gestionnaire. Facultatif : absent = repli sur lireRecents filtre.
   */
  lireParIds?(email: string, internetMessageIds: string[]): Promise<RawMail[]>;
  /** Nombre de mails dans la boite de reception (un appel leger), recus depuis `depuis` si donne ; facultatif. */
  compterReception?(email: string, depuis?: string): Promise<number>;
}
