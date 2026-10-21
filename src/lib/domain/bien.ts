// Le BIEN HORS SYNDIC (ADR-049, Sekou 06/10/2026) : l'immeuble, l'appartement ou le local que
// le cabinet gere en location ou met en vente. La copropriete, elle, vit dans ESTALE.
//
// Premier usage : les trousseaux d'Asnieres repris de Keyko Manager. Les outils locatifs a venir
// (mandats, baux, etats des lieux) retrouveront le meme objet : il n'appartient pas au module cles.

export const ACTIVITES_BIEN = ["location", "transaction"] as const;
export type ActiviteBien = (typeof ACTIVITES_BIEN)[number];

export const TYPES_BIEN = ["immeuble", "appartement", "maison", "parking", "local", "autre"] as const;
export type TypeBien = (typeof TYPES_BIEN)[number];

export interface AdresseBien {
  numeroVoie?: string;
  typeVoie?: string;
  nomVoie?: string;
  complement?: string;
  codePostal?: string;
  ville?: string;
}

export interface ProprietaireBien {
  nom: string;
  prenom?: string;
  telephone?: string;
  email?: string;
}

export type SourceBien = "intranet" | "import_keyko" | "externe";

export interface BienHorsSyndic {
  id: string;
  agenceCode: string;
  activite: ActiviteBien;
  /** Reference du cabinet, unique dans l'agence (ex. « BASSEVILLE-20 »). */
  reference: string;
  type: TypeBien;
  /** Nom d'usage quand la reference ne suffit pas. */
  libelle: string;
  adresse: AdresseBien;
  digicode?: string;
  /** Snapshot tant qu'aucun outil locatif ne l'exploite (cf. intranet_bien.sql). */
  proprietaire?: ProprietaireBien;
  note?: string;
  /** Mandat fini = inactif, jamais supprime. */
  actif: boolean;
  source: SourceBien;
  sourceRef?: string;
}

/** « 22 rue Victor Hugo, 92600 ASNIÈRES-SUR-SEINE » : ce qui est renseigne, dans l'ordre postal. */
export function adresseEnLigne(a: AdresseBien): string {
  const voie = [a.numeroVoie, a.typeVoie, a.nomVoie].map((x) => x?.trim()).filter(Boolean).join(" ");
  const ville = [a.codePostal, a.ville].map((x) => x?.trim()).filter(Boolean).join(" ");
  return [voie, a.complement?.trim(), ville].filter(Boolean).join(", ");
}
