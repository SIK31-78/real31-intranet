// Port : lister les contacts (copropriétaires, conseil syndical, locataires, pros) d'une
// copropriété, pour choisir un destinataire dans le compositeur de mail. LECTURE SEULE.
// Ne dépend que du domaine.

import type { ContactCopro, IdentiteAnnuaire } from "@/lib/domain/mes-emails-composition";

export type { ContactCopro, IdentiteAnnuaire };

export interface ContactsCoproProvider {
  /** Contacts d'une copro, par sa référence affichée (ESTALE ou Crypto) ; [] si inconnue. */
  listerParCopro(reference: string): Promise<ContactCopro[]>;
  /** Personnes dont le nom ou l'adresse contient le texte (3 caractères au moins), 15 au plus. */
  rechercherIdentites(texte: string): Promise<IdentiteAnnuaire[]>;
}
