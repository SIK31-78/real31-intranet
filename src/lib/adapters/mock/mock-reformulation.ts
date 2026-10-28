// Reformulation de démonstration (dev local, IA_REFORMULATION=mock ; jamais en production) :
// aucun appel réseau, un « nettoyage » déterministe et visible (espaces, majuscules en début de
// phrase) pour dérouler le parcours sans clé.

import type { DemandeReformulation, ReformulationProvider, ReponseReformulation } from "@/lib/ports/reformulation-provider";

/** Le brouillon, retrouvé entre ses balises (le message est construit par le domaine). */
function brouillonDe(message: string): string {
  const m = /<brouillon>\n?([\s\S]*?)\n?<\/brouillon>/.exec(message);
  return m?.[1] ?? "";
}

export function reformulationDeDemo(texte: string): string {
  return texte
    .replace(/[ \t]+/g, " ")
    .replace(/ +([,.])/g, "$1")
    .replace(/(^|[.!?]\s+|\n)([a-zà-ÿ])/g, (_, avant: string, l: string) => avant + l.toUpperCase())
    .trim();
}

export class MockReformulationProvider implements ReformulationProvider {
  readonly nom = "mock";

  async reformuler(d: DemandeReformulation): Promise<ReponseReformulation> {
    const texte = reformulationDeDemo(brouillonDe(d.message));
    return {
      texte,
      fin: "termine",
      tokensEntree: Math.ceil((d.systeme.length + d.message.length) / 4),
      tokensSortie: Math.ceil(texte.length / 4),
      modele: "mock",
    };
  }
}
