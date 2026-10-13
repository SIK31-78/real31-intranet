// Contacts fictifs pour dérouler le compositeur sans Supabase (dev/démo).

import type { ContactCopro, IdentiteAnnuaire } from "@/lib/domain/mes-emails-composition";
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

  async rechercherIdentites(texte: string): Promise<IdentiteAnnuaire[]> {
    const q = texte.trim().toLowerCase();
    if (q.length < 3) return [];
    return ECHANTILLON.filter((c) => c.nom.toLowerCase().includes(q) || c.email.includes(q)).map((c) => ({
      cle: c.email,
      nom: c.nom,
      ...(c.metier ? { metier: c.metier } : {}),
      emails: c.qualite === "coproprietaire" ? [c.email, c.email.replace("@", ".pro@")] : [c.email],
      copros: [{ reference: "S0247", qualite: c.qualite }],
    }));
  }
}
