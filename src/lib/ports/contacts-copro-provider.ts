// Port : lister les contacts (copropriétaires, conseil syndical, locataires, pros) d'une
// copropriété, pour choisir un destinataire dans le compositeur de mail. LECTURE SEULE.
// Ne dépend que du domaine.

import type { ContactCopro } from "@/lib/domain/mes-emails-composition";

export type { ContactCopro };

export interface ContactsCoproProvider {
  /** Contacts d'une copro, par sa référence affichée (ESTALE ou Crypto) ; [] si inconnue. */
  listerParCopro(reference: string): Promise<ContactCopro[]>;
}
