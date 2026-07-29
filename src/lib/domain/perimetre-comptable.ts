// Perimetre d'un COMPTABLE : les agences dont il tient la comptabilite (Sekou 2026-07-29).
//
// POURQUOI ce module existe. Un comptable n'a pas de PORTEFEUILLE au sens gestionnaire
// (aucune copro ne porte son id comme managerId) -> tous les ecrans qui scopent par
// `managerId` lui renvoyaient une liste VIDE : il ne pouvait pas facturer, alors que c'est
// precisement son metier. Et l'ouvrir a TOUTES les copros serait faux : chaque comptable
// tient des agences precises.
//
// POURQUOI PAS `User.agencyId`. La table ne porte qu'UNE agence de rattachement, or Romain
// et Elsa tiennent TROIS agences (HLS, LGC, ASN) : le champ ne peut pas exprimer le
// perimetre reel. Isabelle, elle, tient les copros de Maisons-Laffitte (ML).
//
// POURQUOI ICI et pas dans une variable d'environnement. Les allowlists d'env (COMPTABLES,
// MAIL_PILOTES...) sont pratiques mais invisibles et non testables : deux incidents le
// 2026-07-28 sont venus d'une variable qu'on croyait posee. Ce perimetre est une donnee
// CABINET stable, elle merite d'etre lisible, testee et versionnee - meme parti que la liste
// fermee des salles de reunion (domain/salles-reunion.ts). A deplacer en base le jour ou les
// affectations bougeront souvent.

/** Codes d'agence REAL31, alignes sur public."Agency".name. */
export type CodeAgence = "ML" | "LGC" | "HLS" | "ASN";

/** Affectation d'un comptable aux agences dont il tient la compta. */
interface AffectationComptable {
  email: string;
  agences: readonly CodeAgence[];
}

// Liste FERMEE. Un email absent = aucun perimetre agence (le comptable ne verra rien de
// plus qu'avant) : on n'ouvre JAMAIS tout par defaut.
const AFFECTATIONS: readonly AffectationComptable[] = [
  { email: "isabelle.anglade@real31.fr", agences: ["ML"] },
  { email: "romain.gobert@real31.fr", agences: ["HLS", "LGC", "ASN"] },
  { email: "elsa.peixoto@real31.fr", agences: ["HLS", "LGC", "ASN"] },
];

/**
 * Agences dont ce comptable tient la comptabilite. `[]` si l'email n'est pas affecte
 * (comparaison insensible a la casse : l'email Entra peut differer de la table).
 */
export function agencesDuComptable(email: string | null | undefined): CodeAgence[] {
  const cible = (email ?? "").trim().toLowerCase();
  if (!cible) return [];
  return [...(AFFECTATIONS.find((a) => a.email === cible)?.agences ?? [])];
}

/** Ce comptable a-t-il un perimetre agence declare ? */
export function aUnPerimetreComptable(email: string | null | undefined): boolean {
  return agencesDuComptable(email).length > 0;
}

/**
 * Filtre des copros sur le perimetre du comptable. `codeAgenceDe` resout le code d'agence
 * d'une copro (l'appelant le sait : la copro porte un `agenceId` technique, la resolution
 * id -> code passe par la table Agency).
 *
 * Sans perimetre declare -> liste VIDE, jamais la liste complete : ouvrir tout par defaut
 * serait la pire des degradations (un comptable facturerait des copros qui ne sont pas les
 * siennes). Mieux vaut un ecran vide, qui se voit et se signale.
 */
export function filtrerSurPerimetreComptable<T>(
  copros: readonly T[],
  email: string | null | undefined,
  codeAgenceDe: (copro: T) => string | null | undefined,
): T[] {
  const agences = new Set<string>(agencesDuComptable(email));
  if (agences.size === 0) return [];
  return copros.filter((c) => {
    const code = codeAgenceDe(c);
    return Boolean(code) && agences.has(code as string);
  });
}
