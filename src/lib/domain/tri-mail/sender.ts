// Resolution de l'expediteur : interne (cabinet / syndic) vs externe (porte depuis
// assistant-ia). Les mails internes (format Exchange X.500 ou @real31.fr) sont
// masques ; le modele ne peut pas deviner que l'expediteur est le syndic, on lui
// donne le signal.

const RE_X500 = /\/O=EXCHANGELABS|\/CN=RECIPIENTS/i;
const RE_REAL31 = /@real31\.fr/i;

export interface Expediteur {
  type: "interne" | "externe";
  /** Nom lisible best-effort. */
  nom: string;
}

export function resoudreExpediteur(from: string): Expediteur {
  const f = from || "";
  if (RE_X500.test(f)) {
    const m = f.match(/-([A-Za-z][A-Za-z.]+)\s*$/);
    const nom = m?.[1] ? m[1].replace(/\./g, " ").trim() : "collaborateur";
    return { type: "interne", nom };
  }
  if (RE_REAL31.test(f)) return { type: "interne", nom: f.split("@")[0] ?? f };
  return { type: "externe", nom: f };
}
