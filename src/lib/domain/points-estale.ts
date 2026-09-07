// Domaine PUR des points a porter a ESTALE (bloquants, questions, demandes) -
// l'outil admin qui remplace le fichier de notes de Sekou. Cycle simple :
//   a_trancher (interne) -> a_envoyer -> envoye -> repondu -> resolu
// avec `abandonne` accessible partout (et tout reste corrigeable a la main :
// c'est un outil perso d'admin, pas un workflow contraint).

export const STATUTS_POINT_ESTALE = [
  "a_trancher",
  "a_envoyer",
  "envoye",
  "repondu",
  "resolu",
  "abandonne",
] as const;
export type StatutPointEstale = (typeof STATUTS_POINT_ESTALE)[number];

export const LIBELLES_STATUT_POINT: Record<StatutPointEstale, string> = {
  a_trancher: "À trancher (interne)",
  a_envoyer: "À envoyer",
  envoye: "Envoyé à ESTALE",
  repondu: "Répondu",
  resolu: "Résolu",
  abandonne: "Abandonné",
};

/** Ton visuel des badges de statut (design system : neutral/info/warn/ok/err). */
export const TONS_STATUT_POINT: Record<StatutPointEstale, "neutral" | "info" | "warn" | "ok" | "err"> = {
  a_trancher: "warn",
  a_envoyer: "info",
  envoye: "info",
  repondu: "warn",
  resolu: "ok",
  abandonne: "neutral",
};

export const CATEGORIES_POINT_ESTALE = ["produit", "migration", "usage"] as const;
export type CategoriePointEstale = (typeof CATEGORIES_POINT_ESTALE)[number];

export const LIBELLES_CATEGORIE_POINT: Record<CategoriePointEstale, string> = {
  produit: "Produit / évolution",
  migration: "Migration",
  usage: "Usage du SAAS",
};

export interface PointEstale {
  id: string;
  titre: string;
  detail?: string;
  bloquant: boolean;
  categorie: CategoriePointEstale;
  statut: StatutPointEstale;
  /** Reponse d'ESTALE (collee depuis le mail), affichee sous le point. */
  reponse?: string;
  createdAt: string;
  updatedAt?: string;
  resoluAt?: string;
}

export function estStatutPointEstale(v: string): v is StatutPointEstale {
  return (STATUTS_POINT_ESTALE as readonly string[]).includes(v);
}

/** Ordre d'affichage : bloquants d'abord, puis par avancement (a_trancher en tete),
 *  puis les plus recents. Les resolus/abandonnes tombent en bas. */
export function comparerPoints(a: PointEstale, b: PointEstale): number {
  const clos = (p: PointEstale) => (p.statut === "resolu" || p.statut === "abandonne" ? 1 : 0);
  if (clos(a) !== clos(b)) return clos(a) - clos(b);
  if (a.bloquant !== b.bloquant) return a.bloquant ? -1 : 1;
  const rang = (p: PointEstale) => STATUTS_POINT_ESTALE.indexOf(p.statut);
  if (rang(a) !== rang(b)) return rang(a) - rang(b);
  return b.createdAt.localeCompare(a.createdAt);
}
