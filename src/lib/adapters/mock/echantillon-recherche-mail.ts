// Doublure de l'écran « Échanges » (dev sans Graph) : quelques échanges fictifs, filtrés
// grossièrement sur les termes de la requête.

import type { EchangeTrouve, ReponseEnvoyee } from "@/lib/domain/echanges";
import type { RechercheMailProvider } from "@/lib/ports/recherche-mail-provider";

const ECHANTILLON: Omit<EchangeTrouve, "boite">[] = [
  {
    id: "e1",
    internetMessageId: "<e1@exemple>",
    objet: "S247 - Fuite dans le hall",
    deNom: "Jean Dupont",
    deAdresse: "jean.dupont@exemple.fr",
    a: ["syndic4@real31.fr"],
    cc: [],
    date: "2026-10-08T09:12:00Z",
    aPiecesJointes: true,
    apercu: "Bonjour, une fuite est apparue dans le hall de l'immeuble.",
  },
  {
    id: "e2",
    internetMessageId: "<e2@exemple>",
    objet: "RE: S247 - Fuite dans le hall",
    deNom: "Syndic Houilles",
    deAdresse: "syndic4@real31.fr",
    a: ["jean.dupont@exemple.fr"],
    cc: [],
    date: "2026-10-08T14:30:00Z",
    aPiecesJointes: false,
    apercu: "Bonjour Monsieur, le plombier passe jeudi.",
  },
];

export class EchantillonRechercheMail implements RechercheMailProvider {
  async rechercher(p: { boite: string; kql: string; max: number }): Promise<EchangeTrouve[]> {
    const termes = p.kql.toLowerCase().match(/[a-z0-9@.]{3,}/g) ?? [];
    return ECHANTILLON.filter((e) => {
      const texte = `${e.objet} ${e.deAdresse} ${e.a.join(" ")} ${e.apercu}`.toLowerCase();
      return termes.some((t) => texte.includes(t.replace(/^participants/, "")));
    })
      .map((e) => ({ ...e, boite: p.boite }))
      .slice(0, p.max);
  }

  async trouver(p: { boite: string; internetMessageId: string }): Promise<EchangeTrouve | null> {
    const e = ECHANTILLON.find((x) => x.internetMessageId === p.internetMessageId);
    return e ? { ...e, boite: p.boite } : null;
  }

  async envoyes(p: { boite: string; max: number; depuis?: string }): Promise<EchangeTrouve[]> {
    // Les échanges partis de la boîte elle-même (vue « Envoyés » de l'écran E-mails), dans la fenêtre demandée.
    return ECHANTILLON.filter((e) => e.deAdresse === p.boite || e.objet.startsWith("RE:"))
      .filter((e) => !p.depuis || e.date >= p.depuis)
      .map((e) => ({ ...e, boite: p.boite }))
      .slice(0, p.max);
  }

  async lireCorps(p: { id: string }): Promise<string> {
    return ECHANTILLON.find((e) => e.id === p.id)?.apercu ?? "";
  }

  async envoyesDuFil(): Promise<ReponseEnvoyee[]> {
    return [];
  }
}
