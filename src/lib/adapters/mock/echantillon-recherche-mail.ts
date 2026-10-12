// Doublure de l'écran « Échanges » (dev sans Graph) : quelques échanges fictifs, filtrés
// grossièrement sur les termes de la requête.

import type { EchangeTrouve } from "@/lib/domain/echanges";
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

  async lireCorps(p: { id: string }): Promise<string> {
    return ECHANTILLON.find((e) => e.id === p.id)?.apercu ?? "";
  }
}
