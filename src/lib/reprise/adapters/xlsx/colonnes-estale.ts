// Spec EXACTE des templates d'import eStale (relevee depuis templates/*.xlsx le
// 2026-06-30). Source unique : noms de feuilles + ordre/headers des colonnes data.
// L'adapter de generation clone le template et remplit ces colonnes ; il ne touche
// PAS aux colonnes de documentation ("Champ/Requis/Contrainte", "Correspondance...")
// situees plus a droite dans chaque feuille.

/** Feuilles (1re feuille de chaque classeur). */
export const FEUILLES = {
  lots: "Lots",
  tantiemes: "Tantièmes",
  owners: "Copropriétaires",
  links: "Répartitions",
  entries: "Écritures",
} as const;

/** Fichiers templates attendus dans le dossier templates/. */
export const TEMPLATES = {
  lots: "lots - template.xlsx",
  tantiemes: "dkl.xlsx",
  owners: "owners - template.xlsx",
  links: "links - template.xlsx",
  entries: "entries.xlsx",
} as const;

/** Colonnes data, dans l'ordre (= 1re ligne d'en-tete du template). */
export const HEADERS_LOTS = [
  "N° Lot",
  "Type",
  "Usage",
  "Escalier",
  "Étage",
  "Porte",
  "Surface",
  "Nb Pièce",
  "Commentaire",
] as const;

export const HEADERS_TANTIEMES = ["N° Lot", "Tantième"] as const;

/** 22 colonnes - l'ordre du template fait foi. */
export const HEADERS_OWNERS = [
  "Pro",
  "Forme juridique",
  "Raison sociale",
  "Siren",
  "Capital social",
  "Civilité",
  "Nom",
  "Prénom",
  "Date de naissance",
  "Lieu de naissance",
  "Nationalité",
  "Email",
  "N° Tel. Portable",
  "N° Tel. Fixe",
  "Occupant",
  "Adr. Num°",
  "Adr. Voie",
  "Adr. Complément",
  "Adr. Code Postal",
  "Adr. Ville",
  "Adr. Pays",
  "Commentaire",
] as const;

/** Phase B : col A = reference eStale 4 caracteres. Phase A (DRAFT) : col A = NOM en clair. */
export const HEADERS_LINKS = ["N° Copropriétaire", "N° Lot"] as const;
