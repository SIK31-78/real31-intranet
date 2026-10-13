// Contacts fictifs pour dérouler le compositeur sans Supabase (dev/démo).

import type { ContactCopro } from "@/lib/domain/mes-emails-composition";
import type { ContactsCoproProvider } from "@/lib/ports/contacts-copro-provider";

const ECHANTILLON: ContactCopro[] = [
  { email: "president.cs@exemple.fr", nom: "Jean MARTIN (président CS)", qualite: "conseil_syndical" },
  { email: "marie.durand@exemple.fr", nom: "Marie DURAND", qualite: "coproprietaire" },
  { email: "paul.bernard@exemple.fr", nom: "Paul BERNARD", qualite: "coproprietaire" },
  { email: "locataire.a3@exemple.fr", nom: "Sophie PETIT", qualite: "locataire" },
];

export class MockContactsCopro implements ContactsCoproProvider {
  async listerParCopro(): Promise<ContactCopro[]> {
    return ECHANTILLON;
  }
}
