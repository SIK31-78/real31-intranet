// Les 4 etablissements REAL31 cote eStale (establishmentID requis par createCondo).
//
// SPECIFIQUE REAL31 : ces IDs sont ceux du cabinet dans l'eStale de production. Ils
// pourraient etre lus via l'API plus tard (query des etablissements du compte) ; en
// attendant on les fige ici, cote domaine, pour que l'UI propose un choix fiable et que
// le service valide contre une liste fermee (pas d'establishmentID invente).

/** Un etablissement REAL31 : id eStale + sigle court + nom lisible. */
export interface Etablissement {
  /** ID eStale (establishmentID de CondoCreateInput). */
  id: string;
  /** Sigle court affiche dans le selecteur. */
  sigle: string;
  /** Nom lisible. */
  nom: string;
}

/** Liste fermee des 4 etablissements REAL31 (source : eStale prod, verifie manuellement). */
export const ETABLISSEMENTS_REAL31: readonly Etablissement[] = [
  { id: "153e3cc2-7158-4bbe-abef-b2cd815b2742", sigle: "HLS", nom: "Houilles" },
  { id: "9ad15dc9-5e7e-48b8-8870-b278832f1a0b", sigle: "ASN", nom: "Asnieres-sur-Seine" },
  { id: "9aa3161a-a5f5-4ba2-965b-b2e4887d22bd", sigle: "LGC", nom: "La Garenne-Colombes" },
  { id: "1ed6d9e6-2bd4-419b-b72f-8ddd80a9a9ba", sigle: "ML", nom: "Maisons-Laffitte" },
] as const;

/** Les IDs autorises, pour valider un establishmentID recu (Zod / garde-fou). */
export const ETABLISSEMENT_IDS: readonly string[] = ETABLISSEMENTS_REAL31.map((e) => e.id);

/** Retrouve un etablissement par son id (undefined si inconnu). */
export function etablissementParId(id: string): Etablissement | undefined {
  return ETABLISSEMENTS_REAL31.find((e) => e.id === id);
}
