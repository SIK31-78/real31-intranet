// La fiche immeuble au sens du registre national des copropriétés (décision 7 du 16/10/2026) :
// les libellés EXACTS du formulaire du registre, les cascades type -> énergie -> système
// (chauffage) et type -> système (ECS), le nettoyage d'un patch, et ce qui manque encore
// pour qu'une fiche soit complète. Fonctions pures.
//
// Les valeurs sont les CODES stockés dans les tables de l'ancienne application (BuildingMetadata,
// Building) ; les libellés viennent de son module registre.ts, relu contre le formulaire du
// registre. Le registre n'a pas d'API : ces données serviront un export de fichier plus tard,
// elles ne sont transmises nulle part aujourd'hui.

import type { Batiment, FicheImmeuble, PatchFicheImmeuble, TriEtat } from "./types";

// --- Référentiels (codes + libellés) -----------------------------------------------------

export const PERIODES_CONSTRUCTION = [
  "NON_CONNUE",
  "AVANT_1949",
  "DE_1949_A_1974",
  "DE_1975_A_1977",
  "DE_1978_A_1982",
  "DE_1983_A_1988",
  "DE_1989_A_2000",
  "DE_2001_A_2005",
  "DE_2006_A_2012",
  "DE_2013_A_2021",
  "A_COMPTER_DE_2022",
] as const;
export type PeriodeConstruction = (typeof PERIODES_CONSTRUCTION)[number];

export const LIBELLE_PERIODE_CONSTRUCTION: Record<PeriodeConstruction, string> = {
  NON_CONNUE: "Non connue",
  AVANT_1949: "Avant 1949",
  DE_1949_A_1974: "De 1949 à 1974",
  DE_1975_A_1977: "De 1975 à 1977",
  DE_1978_A_1982: "De 1978 à 1982",
  DE_1983_A_1988: "De 1983 à 1988",
  DE_1989_A_2000: "De 1989 à 2000",
  DE_2001_A_2005: "De 2001 à 2005",
  DE_2006_A_2012: "De 2006 à 2012",
  DE_2013_A_2021: "De 2013 à 2021",
  A_COMPTER_DE_2022: "À compter de 2022",
};

/** Les types de chauffage que le formulaire PROPOSE (ceux du registre). */
export const TYPES_CHAUFFAGE = ["COLLECTIF", "INDIVIDUEL", "MIXTE", "SANS_CHAUFFAGE"] as const;
export type TypeChauffage = (typeof TYPES_CHAUFFAGE)[number];
/** Deux valeurs héritées de l'ancienne base : affichées si présentes, jamais proposées. */
export const TYPES_CHAUFFAGE_HERITES = ["COLLECTIF_CHAUFFAGE_URBAIN", "MIXTE_CHAUFFAGE_URBAIN"] as const;
export type TypeChauffageConnu = TypeChauffage | (typeof TYPES_CHAUFFAGE_HERITES)[number];

export const LIBELLE_TYPE_CHAUFFAGE: Record<TypeChauffageConnu, string> = {
  COLLECTIF: "Collectif",
  INDIVIDUEL: "Individuel",
  MIXTE: "Mixte",
  SANS_CHAUFFAGE: "Sans chauffage",
  COLLECTIF_CHAUFFAGE_URBAIN: "Collectif, chauffage urbain",
  MIXTE_CHAUFFAGE_URBAIN: "Mixte, chauffage urbain",
};

export const ENERGIES_CHAUFFAGE = ["GAZ", "FIOUL", "ELECTRICITE", "GPL", "CHARBON", "BOIS", "RESEAU_CHALEUR", "AUTRE"] as const;
export type EnergieChauffage = (typeof ENERGIES_CHAUFFAGE)[number];
/** « MIXTE » est un TYPE pour le registre, pas une énergie : valeur héritée, affichée seulement. */
export type EnergieChauffageConnue = EnergieChauffage | "MIXTE";

export const LIBELLE_ENERGIE_CHAUFFAGE: Record<EnergieChauffageConnue, string> = {
  GAZ: "Gaz naturel",
  FIOUL: "Fioul",
  ELECTRICITE: "Électricité",
  GPL: "GPL propane ou butane",
  CHARBON: "Charbon",
  BOIS: "Bois",
  RESEAU_CHALEUR: "Réseau de chaleur",
  AUTRE: "Autre",
  MIXTE: "Mixte",
};

export const SYSTEMES_CHAUFFAGE = [
  "CHAUDIERE_STANDARD",
  "CHAUDIERE_BASSE_TEMPERATURE",
  "CHAUDIERE_CONDENSATION",
  "SOUS_STATION",
  "CHAUDIERE_ELECTRIQUE",
  "RADIATEURS_ELECTRIQUES",
  "PAC_AIR_AIR",
  "PAC_AIR_EAU",
  "PAC_EAU_EAU",
  "PAC_GEOTHERMIQUE",
  "CHAUDIERE_POELE_CHARBON",
  "CHAUDIERE_BIOMASSE",
  "AUTRE",
] as const;
export type SystemeChauffage = (typeof SYSTEMES_CHAUFFAGE)[number];

export const LIBELLE_SYSTEME_CHAUFFAGE: Record<SystemeChauffage, string> = {
  CHAUDIERE_STANDARD: "Chaudière standard",
  CHAUDIERE_BASSE_TEMPERATURE: "Chaudière basse température",
  CHAUDIERE_CONDENSATION: "Chaudière à condensation",
  SOUS_STATION: "Sous-station",
  CHAUDIERE_ELECTRIQUE: "Chaudière électrique",
  RADIATEURS_ELECTRIQUES: "Radiateurs ou émetteurs électriques",
  PAC_AIR_AIR: "Pompe à chaleur air/air",
  PAC_AIR_EAU: "Pompe à chaleur air/eau",
  PAC_EAU_EAU: "Pompe à chaleur eau/eau",
  PAC_GEOTHERMIQUE: "Pompe à chaleur géothermique",
  CHAUDIERE_POELE_CHARBON: "Chaudière et poêle charbon",
  CHAUDIERE_BIOMASSE: "Chaudière biomasse",
  AUTRE: "Autre",
};

export const TYPES_ECS = ["INDIVIDUEL", "COLLECTIF", "MIXTE"] as const;
export type TypeEcs = (typeof TYPES_ECS)[number];
export const LIBELLE_TYPE_ECS: Record<TypeEcs, string> = { INDIVIDUEL: "Individuel", COLLECTIF: "Collectif", MIXTE: "Mixte" };

export const SYSTEMES_ECS = [
  "CHAUFFE_EAU_THERMODYNAMIQUE",
  "BALLON_CUMULUS_ELECTRIQUE",
  "CHAUDIERE",
  "POMPE_A_CHALEUR",
  "SOLAIRE_THERMIQUE",
  "RESEAU_CHAUFFAGE_URBAIN",
  "AUTRE",
] as const;
export type SystemeEcs = (typeof SYSTEMES_ECS)[number];

export const LIBELLE_SYSTEME_ECS: Record<SystemeEcs, string> = {
  CHAUFFE_EAU_THERMODYNAMIQUE: "Chauffe-eau thermodynamique",
  BALLON_CUMULUS_ELECTRIQUE: "Ballon cumulus électrique",
  CHAUDIERE: "Chaudière",
  POMPE_A_CHALEUR: "Pompe à chaleur",
  SOLAIRE_THERMIQUE: "Solaire thermique",
  RESEAU_CHAUFFAGE_URBAIN: "Réseau de chauffage urbain",
  AUTRE: "Autre",
};

export const TYPES_VENTILATION = ["COLLECTIF", "INDIVIDUEL"] as const;
export type TypeVentilation = (typeof TYPES_VENTILATION)[number];
export const LIBELLE_TYPE_VENTILATION: Record<TypeVentilation, string> = { COLLECTIF: "Collectif", INDIVIDUEL: "Individuel" };

export const SYSTEMES_VENTILATION = ["MECANIQUE", "NATUREL", "HYBRIDE"] as const;
export type SystemeVentilation = (typeof SYSTEMES_VENTILATION)[number];
export const LIBELLE_SYSTEME_VENTILATION: Record<SystemeVentilation, string> = { MECANIQUE: "Mécanique", NATUREL: "Naturel", HYBRIDE: "Hybride" };

export const ETIQUETTES_ENERGIE = ["A", "B", "C", "D", "E", "F", "G", "NON_DETERMINE"] as const;
export type EtiquetteEnergie = (typeof ETIQUETTES_ENERGIE)[number];
export const LIBELLE_ETIQUETTE_ENERGIE: Record<EtiquetteEnergie, string> = {
  A: "A",
  B: "B",
  C: "C",
  D: "D",
  E: "E",
  F: "F",
  G: "G",
  NON_DETERMINE: "Non déterminé",
};

export const TRI_ETATS = ["oui", "non", "non_connue"] as const satisfies readonly TriEtat[];
export const LIBELLE_TRI_ETAT: Record<TriEtat, string> = { oui: "Oui", non: "Non", non_connue: "Non connue" };

/** Les questions à tri-état du registre, dans l'ordre du formulaire. Seule la question des
 *  locaux vélos admet « Non connue » ; les autres se répondent par oui ou non. */
export const QUESTIONS_TRI_ETAT: readonly {
  cle: "dpeCollectifRealise" | "diagnosticStructureRealise" | "bornesRechargeVE" | "locauxVelos";
  libelle: string;
  court: string;
  nonConnuePermis: boolean;
}[] = [
  { cle: "dpeCollectifRealise", libelle: "Réalisation d'un DPE collectif", court: "DPE collectif", nonConnuePermis: false },
  { cle: "diagnosticStructureRealise", libelle: "Réalisation d'un diagnostic structure", court: "Diagnostic structure", nonConnuePermis: false },
  {
    cle: "bornesRechargeVE",
    libelle: "Présence d'infrastructures de recharge pour véhicules électriques ou hybrides rechargeables",
    court: "Bornes de recharge",
    nonConnuePermis: false,
  },
  { cle: "locauxVelos", libelle: "Présence de locaux vélos", court: "Locaux vélos", nonConnuePermis: true },
];

export const LIBELLE_QUESTION_PPT_VOTE = "Avez-vous voté l'adoption d'un plan pluriannuel de travaux (partiellement ou totalement) ?";
export const LIBELLE_QUESTION_PPT_INSCRIT_AG =
  "Le projet de plan pluriannuel de travaux a-t-il été inscrit à l'ordre du jour de votre assemblée générale ?";
export const LIBELLE_QUESTION_ECS_MEME = "Système de production d'eau chaude sanitaire identique au système de chauffage ?";

export function libelleDe<K extends string>(libelles: Record<K, string>, code: string | null | undefined): string | null {
  if (!code) return null;
  return (libelles as Record<string, string>)[code] ?? code;
}

// --- Cascades du registre ----------------------------------------------------------------
// Chauffage : type -> énergies permises, puis (type x énergie) -> systèmes permis.
// ECS : type -> systèmes permis. Reprises de registreCascades.ts de l'ancienne application.

const ENERGIES_SANS_RESEAU = ENERGIES_CHAUFFAGE.filter((e) => e !== "RESEAU_CHALEUR");

/** Les énergies qu'un type de chauffage admet. Type inconnu ou vide : toutes (on ne filtre
 *  pas tant que le type n'est pas choisi). « Sans chauffage » : aucune. */
export function energiesPossibles(type: string | null | undefined): readonly EnergieChauffage[] {
  if (!type) return ENERGIES_CHAUFFAGE;
  if (type === "SANS_CHAUFFAGE") return [];
  if (type === "INDIVIDUEL") return ENERGIES_SANS_RESEAU;
  return ENERGIES_CHAUFFAGE;
}

const CHAUDIERES_COMBUSTIBLE: readonly SystemeChauffage[] = ["CHAUDIERE_STANDARD", "CHAUDIERE_BASSE_TEMPERATURE", "CHAUDIERE_CONDENSATION", "AUTRE"];
const CHARBON: readonly SystemeChauffage[] = ["CHAUDIERE_POELE_CHARBON", "AUTRE"];
const BOIS: readonly SystemeChauffage[] = ["CHAUDIERE_BIOMASSE", "AUTRE"];
const RESEAU: readonly SystemeChauffage[] = ["SOUS_STATION", "AUTRE"];
const ELEC_COLLECTIF: readonly SystemeChauffage[] = ["CHAUDIERE_ELECTRIQUE", "PAC_AIR_AIR", "PAC_AIR_EAU", "PAC_EAU_EAU", "PAC_GEOTHERMIQUE", "AUTRE"];
const ELEC_INDIVIDUEL: readonly SystemeChauffage[] = ["CHAUDIERE_ELECTRIQUE", "RADIATEURS_ELECTRIQUES", "PAC_AIR_AIR", "PAC_AIR_EAU", "AUTRE"];
const ELEC_MIXTE: readonly SystemeChauffage[] = ["CHAUDIERE_ELECTRIQUE", "RADIATEURS_ELECTRIQUES", "PAC_AIR_AIR", "PAC_AIR_EAU", "PAC_EAU_EAU", "PAC_GEOTHERMIQUE", "AUTRE"];

type Famille = "collectif" | "individuel" | "mixte" | "sans";

function familleDe(type: string): Famille | null {
  switch (type) {
    case "COLLECTIF":
    case "COLLECTIF_CHAUFFAGE_URBAIN":
      return "collectif";
    case "INDIVIDUEL":
      return "individuel";
    case "MIXTE":
    case "MIXTE_CHAUFFAGE_URBAIN":
      return "mixte";
    case "SANS_CHAUFFAGE":
      return "sans";
    default:
      return null;
  }
}

/** Les systèmes qu'un couple (type, énergie) admet. Sans type ou sans énergie : tous. */
export function systemesChauffagePossibles(type: string | null | undefined, energie: string | null | undefined): readonly SystemeChauffage[] {
  if (!type || !energie) return SYSTEMES_CHAUFFAGE;
  const famille = familleDe(type);
  if (famille === null) return SYSTEMES_CHAUFFAGE;
  if (famille === "sans") return [];
  switch (energie) {
    case "GAZ":
    case "GPL":
    case "FIOUL":
      return CHAUDIERES_COMBUSTIBLE;
    case "CHARBON":
      return CHARBON;
    case "BOIS":
      return BOIS;
    case "RESEAU_CHALEUR":
      return RESEAU;
    case "ELECTRICITE":
      return famille === "collectif" ? ELEC_COLLECTIF : famille === "individuel" ? ELEC_INDIVIDUEL : ELEC_MIXTE;
    case "AUTRE":
      return SYSTEMES_CHAUFFAGE;
    default:
      return []; // énergie héritée (MIXTE) : rien de cohérent
  }
}

const ECS_INDIVIDUEL: readonly SystemeEcs[] = ["CHAUFFE_EAU_THERMODYNAMIQUE", "BALLON_CUMULUS_ELECTRIQUE", "AUTRE"];
const ECS_COLLECTIF: readonly SystemeEcs[] = ["CHAUDIERE", "POMPE_A_CHALEUR", "SOLAIRE_THERMIQUE", "RESEAU_CHAUFFAGE_URBAIN", "AUTRE"];

/** Les systèmes d'ECS qu'un type admet. Sans type : tous. « Mixte » : l'union des deux. */
export function systemesEcsPossibles(typeEcs: string | null | undefined): readonly SystemeEcs[] {
  if (!typeEcs) return SYSTEMES_ECS;
  if (typeEcs === "INDIVIDUEL") return ECS_INDIVIDUEL;
  if (typeEcs === "COLLECTIF") return ECS_COLLECTIF;
  return SYSTEMES_ECS;
}

// --- Nettoyage d'un patch ----------------------------------------------------------------

type ChampFiche = keyof PatchFicheImmeuble;

/**
 * Remet à null ce que le patch rend incohérent, en regardant la fiche telle qu'elle SERA :
 * - « Sans chauffage » : ni énergie ni système ;
 * - une énergie que le nouveau type n'admet plus tombe, et le système avec elle ;
 * - un système que le couple (type, énergie) n'admet plus tombe ;
 * - ECS identique au chauffage : pas de système d'ECS ; sinon un système hors du type tombe ;
 * - la date d'adoption du PPT n'existe que si le PPT est voté ; la question « inscrit à l'AG »
 *   ne se pose que s'il ne l'est pas.
 * Ne touche qu'aux champs qu'il faut : un champ déjà null dans la fiche n'entre pas dans le patch.
 */
export function appliquerCascades(patch: PatchFicheImmeuble, actuelle: FicheImmeuble | null): PatchFicheImmeuble {
  const resultat: PatchFicheImmeuble = { ...patch };
  const defini = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as PatchFicheImmeuble;
  const eff: Partial<FicheImmeuble> = { ...(actuelle ?? {}), ...defini };

  const annuler = (cle: ChampFiche) => {
    if (eff[cle] !== null && eff[cle] !== undefined) {
      (resultat as Record<string, unknown>)[cle] = null;
      (eff as Record<string, unknown>)[cle] = null;
    } else if (cle in resultat) {
      (resultat as Record<string, unknown>)[cle] = null;
    }
  };

  // Chauffage.
  if (eff.chauffageType === "SANS_CHAUFFAGE") {
    annuler("chauffageEnergie");
    annuler("chauffageSysteme");
  } else {
    if (eff.chauffageEnergie && !(energiesPossibles(eff.chauffageType) as readonly string[]).includes(eff.chauffageEnergie)) {
      annuler("chauffageEnergie");
      annuler("chauffageSysteme");
    }
    if (eff.chauffageSysteme && !(systemesChauffagePossibles(eff.chauffageType, eff.chauffageEnergie) as readonly string[]).includes(eff.chauffageSysteme)) {
      annuler("chauffageSysteme");
    }
  }

  // Eau chaude sanitaire.
  if (eff.ecsMemeQueChauffage === true) {
    annuler("ecsSysteme");
  } else if (eff.ecsSysteme && !(systemesEcsPossibles(eff.ecsType) as readonly string[]).includes(eff.ecsSysteme)) {
    annuler("ecsSysteme");
  }

  // Plan pluriannuel de travaux.
  if (eff.pptVote !== "oui") annuler("pptAdoptionISO");
  if (eff.pptVote !== "non") annuler("pptInscritAG");

  return resultat;
}

// --- Ce qui manque -----------------------------------------------------------------------

/** Les champs de la fiche, avec leur libellé court (file « à compléter », journal). */
export const LIBELLE_CHAMP_IMMEUBLE: Record<ChampFiche, string> = {
  surfaceM2: "Surface",
  anneeConstruction: "Année de construction",
  periodeConstruction: "Période de construction",
  nombreBatiments: "Nombre de bâtiments",
  chauffageType: "Type de chauffage",
  chauffageEnergie: "Énergie de chauffage",
  chauffageSysteme: "Système de chauffage",
  ecsType: "Type d'ECS",
  ecsSysteme: "Système d'ECS",
  ecsMemeQueChauffage: "ECS identique au chauffage",
  ventilationType: "Type de ventilation",
  ventilationSysteme: "Système de ventilation",
  bornesRechargeVE: "Bornes de recharge",
  locauxVelos: "Locaux vélos",
  dpeCollectifRealise: "DPE collectif",
  diagnosticStructureRealise: "Diagnostic structure",
  pptInscritAG: "PPT inscrit à l'AG",
  pptVote: "PPT voté",
  pptAdoptionISO: "Date d'adoption du PPT",
  primeAssuranceActuelle: "Prime d'assurance",
  notes: "Notes",
};

export const LIBELLE_BATIMENTS_MANQUANTS = "Bâtiments";

const vide = (v: unknown) => v === null || v === undefined || v === "";

/**
 * Les champs du registre encore vides, libellés en français, en respectant les masquages du
 * formulaire (pas d'énergie sans chauffage, pas de système d'ECS si identique au chauffage,
 * pas de date de PPT s'il n'est pas voté). Les notes et la prime d'assurance ne comptent pas.
 * « Bâtiments » s'ajoute s'il n'y a aucun bâtiment, moins que le nombre annoncé, ou un
 * bâtiment incomplet.
 */
export function champsManquantsImmeuble(f: FicheImmeuble | null): string[] {
  const manquants: string[] = [];
  const marquer = (cle: ChampFiche, valeur: unknown) => {
    if (vide(valeur)) manquants.push(LIBELLE_CHAMP_IMMEUBLE[cle]);
  };

  marquer("surfaceM2", f?.surfaceM2);
  marquer("anneeConstruction", f?.anneeConstruction);
  marquer("periodeConstruction", f?.periodeConstruction);
  marquer("nombreBatiments", f?.nombreBatiments);

  marquer("chauffageType", f?.chauffageType);
  if (f?.chauffageType !== "SANS_CHAUFFAGE") {
    marquer("chauffageEnergie", f?.chauffageEnergie);
    marquer("chauffageSysteme", f?.chauffageSysteme);
  }

  marquer("ecsType", f?.ecsType);
  marquer("ecsMemeQueChauffage", f?.ecsMemeQueChauffage);
  if (f?.ecsMemeQueChauffage !== true) marquer("ecsSysteme", f?.ecsSysteme);

  marquer("ventilationType", f?.ventilationType);
  marquer("ventilationSysteme", f?.ventilationSysteme);
  for (const q of QUESTIONS_TRI_ETAT) marquer(q.cle, f?.[q.cle]);

  marquer("pptVote", f?.pptVote);
  if (f?.pptVote === "oui") marquer("pptAdoptionISO", f?.pptAdoptionISO);
  if (f?.pptVote === "non") marquer("pptInscritAG", f?.pptInscritAG);

  const batiments = f?.batiments ?? [];
  const attendus = f?.nombreBatiments ?? null;
  const incomplet = batiments.some((b) => vide(b.anneeConstruction) || vide(b.nombreEtages) || vide(b.nombreAscenseurs) || vide(b.etiquetteEnergie));
  if (batiments.length === 0 || (attendus !== null && batiments.length < attendus) || incomplet) manquants.push(LIBELLE_BATIMENTS_MANQUANTS);

  return manquants;
}

export function estImmeubleACompleter(f: FicheImmeuble | null): boolean {
  return champsManquantsImmeuble(f).length > 0;
}

// --- Validation --------------------------------------------------------------------------

export const ANNEE_CONSTRUCTION_MIN = 1600;
export const ETAGES_MAX = 60;
export const ASCENSEURS_MAX = 99;
export const BATIMENTS_MAX = 50;
export const SURFACE_MAX_M2 = 10_000_000;

/** Un message d'erreur si la fiche n'est pas acceptable, null sinon. */
export function erreurFicheImmeuble(patch: PatchFicheImmeuble, anneeCourante: number): string | null {
  if (patch.surfaceM2 != null && !(patch.surfaceM2 > 0 && patch.surfaceM2 <= SURFACE_MAX_M2)) return "La surface doit être un nombre positif.";
  if (patch.anneeConstruction != null) {
    const e = erreurAnnee(patch.anneeConstruction, anneeCourante);
    if (e) return e;
  }
  if (patch.nombreBatiments != null && (!Number.isInteger(patch.nombreBatiments) || patch.nombreBatiments < 0 || patch.nombreBatiments > BATIMENTS_MAX)) {
    return `Le nombre de bâtiments va de 0 à ${BATIMENTS_MAX}.`;
  }
  if (patch.primeAssuranceActuelle != null && patch.primeAssuranceActuelle < 0) return "La prime d'assurance ne peut pas être négative.";
  return null;
}

/** Un message d'erreur si le bâtiment n'est pas acceptable, null sinon. */
export function erreurBatiment(b: Pick<Batiment, "nom" | "anneeConstruction" | "nombreEtages" | "nombreAscenseurs">, anneeCourante: number): string | null {
  if (!b.nom.trim()) return "Le bâtiment doit avoir un nom.";
  if (b.nom.trim().length > 200) return "Le nom du bâtiment est trop long (200 caractères au plus).";
  if (b.anneeConstruction != null) {
    const e = erreurAnnee(b.anneeConstruction, anneeCourante);
    if (e) return e;
  }
  if (b.nombreEtages != null && (!Number.isInteger(b.nombreEtages) || b.nombreEtages < 0 || b.nombreEtages > ETAGES_MAX)) {
    return `Le nombre d'étages va de 0 à ${ETAGES_MAX}.`;
  }
  if (b.nombreAscenseurs != null && (!Number.isInteger(b.nombreAscenseurs) || b.nombreAscenseurs < 0 || b.nombreAscenseurs > ASCENSEURS_MAX)) {
    return `Le nombre d'ascenseurs va de 0 à ${ASCENSEURS_MAX}.`;
  }
  return null;
}

function erreurAnnee(annee: number, anneeCourante: number): string | null {
  if (!Number.isInteger(annee) || annee < ANNEE_CONSTRUCTION_MIN || annee > anneeCourante) {
    return `L'année de construction va de ${ANNEE_CONSTRUCTION_MIN} à ${anneeCourante}.`;
  }
  return null;
}

// --- Bâtiments : pré-remplissage ---------------------------------------------------------

/** 0 -> A, 1 -> B, 25 -> Z, 26 -> AA (numérotation tableur). */
export function lettreBatiment(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new Error(`lettreBatiment : index invalide (${String(index)}).`);
  let s = "";
  let x = index;
  do {
    s = String.fromCharCode(65 + (x % 26)) + s;
    x = Math.floor(x / 26) - 1;
  } while (x >= 0);
  return s;
}

/** Répartit `total` ascenseurs sur `nb` bâtiments, le plus également possible, les premiers
 *  servis d'abord : 3 sur 2 -> [2, 1]. */
export function repartirAscenseurs(total: number, nb: number): number[] {
  if (nb <= 0) return [];
  const t = Math.max(0, Math.trunc(total));
  const base = Math.floor(t / nb);
  const reste = t % nb;
  return Array.from({ length: nb }, (_, i) => base + (i < reste ? 1 : 0));
}

/**
 * Les bâtiments à créer pour atteindre le nombre annoncé : nommés par position (« Bâtiment C »
 * si deux existent déjà), l'année reprise de la fiche, les ascenseurs répartis quand le
 * compteur est connu. Vide s'il n'y a rien à faire.
 */
export function batimentsAPrefiller(p: {
  coproCode: string;
  nombreBatiments: number | null;
  existants: number;
  anneeConstruction: number | null;
  totalAscenseurs: number | null;
}): Omit<Batiment, "id">[] {
  if (p.nombreBatiments === null || p.nombreBatiments <= p.existants) return [];
  const repartition = p.totalAscenseurs === null ? null : repartirAscenseurs(p.totalAscenseurs, p.nombreBatiments);
  const nouveaux: Omit<Batiment, "id">[] = [];
  for (let position = p.existants; position < p.nombreBatiments; position++) {
    nouveaux.push({
      coproCode: p.coproCode,
      nom: `Bâtiment ${lettreBatiment(position)}`,
      anneeConstruction: p.anneeConstruction,
      nombreEtages: null,
      nombreAscenseurs: repartition ? repartition[position] : null,
      etiquetteEnergie: null,
    });
  }
  return nouveaux;
}

// --- Résumés pour l'affichage ------------------------------------------------------------

function enMinuscule(libelle: string): string {
  // « Gaz naturel » -> « gaz naturel », mais « GPL propane ou butane » reste tel quel.
  return libelle.length > 1 && libelle[1] === libelle[1].toLowerCase() ? libelle[0].toLowerCase() + libelle.slice(1) : libelle;
}

/** « Collectif, gaz naturel, chaudière à condensation » ; null si rien n'est renseigné. */
export function resumeChauffage(f: Pick<FicheImmeuble, "chauffageType" | "chauffageEnergie" | "chauffageSysteme">): string | null {
  const type = libelleDe(LIBELLE_TYPE_CHAUFFAGE, f.chauffageType);
  if (f.chauffageType === "SANS_CHAUFFAGE") return type;
  const parts = [type, libelleDe(LIBELLE_ENERGIE_CHAUFFAGE, f.chauffageEnergie), libelleDe(LIBELLE_SYSTEME_CHAUFFAGE, f.chauffageSysteme)].filter((x): x is string => x !== null);
  if (parts.length === 0) return null;
  return parts.map((p, i) => (i === 0 ? p : enMinuscule(p))).join(", ");
}

/** « Collectif, chaudière » ou « Individuel, identique au chauffage » ; null si rien. */
export function resumeEcs(f: Pick<FicheImmeuble, "ecsType" | "ecsSysteme" | "ecsMemeQueChauffage">): string | null {
  const parts: string[] = [];
  const type = libelleDe(LIBELLE_TYPE_ECS, f.ecsType);
  if (type) parts.push(type);
  if (f.ecsMemeQueChauffage === true) parts.push("identique au chauffage");
  else {
    const sys = libelleDe(LIBELLE_SYSTEME_ECS, f.ecsSysteme);
    if (sys) parts.push(enMinuscule(sys));
  }
  return parts.length ? parts.join(", ") : null;
}

/** « Collectif, mécanique » ; null si rien. */
export function resumeVentilation(f: Pick<FicheImmeuble, "ventilationType" | "ventilationSysteme">): string | null {
  const parts = [libelleDe(LIBELLE_TYPE_VENTILATION, f.ventilationType), libelleDe(LIBELLE_SYSTEME_VENTILATION, f.ventilationSysteme)].filter((x): x is string => x !== null);
  if (parts.length === 0) return null;
  return parts.map((p, i) => (i === 0 ? p : enMinuscule(p))).join(", ");
}
