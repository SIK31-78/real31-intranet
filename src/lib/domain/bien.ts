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

export const LIBELLE_ACTIVITE_BIEN: Record<ActiviteBien, string> = { location: "Location", transaction: "Transaction (vente)" };
export const LIBELLE_TYPE_BIEN: Record<TypeBien, string> = {
  immeuble: "Immeuble",
  appartement: "Appartement",
  maison: "Maison",
  parking: "Parking",
  local: "Local",
  autre: "Autre",
};

// --- Creation d'un bien a l'ecran (REA-53) -----------------------------------------------

/** Ce que l'ecran envoie, avant toute verification. */
export interface NouveauBienSaisie {
  activite: string;
  reference: string;
  type: string;
  adresse?: AdresseBien;
  proprietaire: { nom: string; prenom?: string; telephone?: string; email?: string };
  note?: string;
}

/** Un bien verifie et nettoye, pret a etre enregistre (l'agence et l'auteur viennent du serveur). */
export interface NouveauBien {
  activite: ActiviteBien;
  reference: string;
  type: TypeBien;
  adresse: AdresseBien;
  proprietaire: ProprietaireBien;
  note?: string;
}

export const REFERENCE_BIEN_MAX = 40;

/** « trillot-18  » -> « TRILLOT-18 » : majuscules, un seul espace entre les mots (comme les references Keyko). */
export function referenceBienCanonique(saisie: string): string {
  return saisie.trim().replace(/\s+/g, " ").toUpperCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function net(s: string | undefined): string | undefined {
  const t = s?.trim().replace(/\s+/g, " ");
  return t ? t : undefined;
}

/** Verification pure : renvoie le bien nettoye ou une phrase qui dit quoi corriger. */
export function validerNouveauBien(s: NouveauBienSaisie): { ok: true; bien: NouveauBien } | { ok: false; erreur: string } {
  const activite = ACTIVITES_BIEN.find((a) => a === s.activite);
  if (!activite) return { ok: false, erreur: "Choisis l'activité du bien : location ou transaction." };
  const type = TYPES_BIEN.find((t) => t === s.type);
  if (!type) return { ok: false, erreur: "Choisis le type du bien." };
  const reference = referenceBienCanonique(s.reference);
  if (!reference) return { ok: false, erreur: "La référence du bien est obligatoire." };
  if (reference.length > REFERENCE_BIEN_MAX) return { ok: false, erreur: `La référence est trop longue (${REFERENCE_BIEN_MAX} caractères au plus).` };
  const nom = net(s.proprietaire.nom);
  if (!nom) return { ok: false, erreur: "Le nom du propriétaire est obligatoire." };
  const email = net(s.proprietaire.email)?.toLowerCase();
  if (email && !EMAIL_RE.test(email)) return { ok: false, erreur: "L'e-mail du propriétaire n'est pas valide." };
  const prenom = net(s.proprietaire.prenom);
  const telephone = net(s.proprietaire.telephone);
  const a = s.adresse ?? {};
  const adresse: AdresseBien = {};
  for (const k of ["numeroVoie", "typeVoie", "nomVoie", "complement", "codePostal", "ville"] as const) {
    const v = net(a[k]);
    if (v) adresse[k] = v;
  }
  const note = net(s.note);
  return {
    ok: true,
    bien: {
      activite,
      reference,
      type,
      adresse,
      proprietaire: { nom, ...(prenom ? { prenom } : {}), ...(telephone ? { telephone } : {}), ...(email ? { email } : {}) },
      ...(note ? { note } : {}),
    },
  };
}

export function messageReferenceBienExiste(reference: string, agenceCode: string): string {
  return `La référence ${reference} existe déjà à l'agence ${agenceCode} : choisis ce bien dans la liste.`;
}
