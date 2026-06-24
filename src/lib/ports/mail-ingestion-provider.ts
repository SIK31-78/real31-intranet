// Port d'ingestion de mail : recupere les mails recents d'une boite. En reel,
// adapter Graph delegue (la boite du gestionnaire connecte) ; en test, adapter
// echantillon. Ne depend que du domaine.

import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";

export interface OptionsIngestion {
  /** Adresse de la boite a lire ; inutile en delegue (/me), utile en app-only. */
  email?: string;
  /** Nombre max de mails recents a remonter. */
  max: number;
}

export interface MailIngestionProvider {
  lireRecents(opts: OptionsIngestion): Promise<RawMail[]>;
}
