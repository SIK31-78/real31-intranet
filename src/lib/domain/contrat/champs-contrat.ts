// Les valeurs qui remplissent un contrat de syndic.
//
// Portage du flow PowerApps `[REAL] Generation du contrat de syndic` (MYTHEC) et de
// son Office Script `ContratReplace`, qui remplacait 42 balises `[Xxx]` dans un
// classeur Excel modele. Ici, pas de publipostage : le document est un composant
// React et ces champs sont ses donnees. Le module reste PUR et testable hors base.
//
// DEUX NIVEAUX POUR CHAQUE PRESTATION, comme le legacy : le TTC lu au bareme et le
// HT qui en decoule. Le contrat affiche les deux.

import { dureeContratTexte } from "./duree-contrat";
import { htDepuisTtc, ttcBrut } from "./montants-contrat";

/**
 * Les 21 prestations du bareme citees dans le contrat, dans l'ordre du document.
 * Ce sont les `identifiant_prestation` de la table `intranet_tarifs` - un identifiant
 * inconnu ferait lever le service, jamais silencieusement zero (durcissement vs
 * PowerApps, cf. services/facturation/bareme.ts).
 */
export const PRESTATIONS_CONTRAT = [
  "AGE",
  "CSSupp",
  "VisiteSupp",
  "ModifRCP",
  "DepLieu",
  "MesConser",
  "AssExp",
  "DossierAssureur",
  "MED",
  "DossierAvocat",
  "RepriseCompta",
  "DossierEmprunt",
  "ImmatInitiale",
  "Echeancier",
  "Hypotheque",
  "Injonction",
  "DossierJustice",
  "EtatDate",
  "Opposition",
  "DelivranceCopie",
  "TauxHoraire",
] as const;

export type PrestationContrat = (typeof PRESTATIONS_CONTRAT)[number];

/** Un tarif du contrat : le TTC du bareme et le HT qui en decoule. */
export interface TarifContrat {
  identifiant: PrestationContrat;
  /** Libelle lisible, tel qu'il est en base (`intranet_tarifs.libelle`). */
  libelle: string;
  ttc: number;
  /** "136.38" - deux decimales, comme le legacy. */
  ht: string;
  /** "163.65" - le TTC brut, deux decimales. */
  ttcTexte: string;
}

/** Ce que la copropriete apporte au contrat. Tout vient de `Copropriete`. */
export interface CoproContrat {
  code: string;
  nom: string;
  adresse1: string;
  adresse2: string;
  adresse3: string;
  codePostal: string;
  ville: string;
  /** Numero au registre national des coproprietes (`registrationNumber`). */
  immatriculation: string;
  assurance: string;
  /** Date de souscription de l'assurance, ISO. */
  assuranceDateISO: string;
  /** Code d'agence (ML / LGC / HLS / ASN). */
  agence: string;
  lotsPrincipaux: number;
  lotsAutres: number;
  /** Visites incluses au contrat (`visitCount`). */
  nbVisites: number;
  /** Duree d'AG incluse, en heures (`agDurationHours`). */
  dureeAgHeures: number;
  /** Conseils syndicaux inclus (`csCount`). */
  nbCs: number;
  /**
   * Duree de CS incluse, en HEURES. La colonne source s'appelle
   * `csDurationMinutes` mais contient des heures : piege deja documente dans
   * ports/facturation-repository.ts, ne pas le redecouvrir.
   */
  dureeCsHeures: number;
  /** Heure de fin de la plage contractuelle d'AG (`agEndMax`). */
  finMaxAgHeure: number | null;
}

/** Ce que le cycle de contrat apporte. */
export interface CycleContratChamps {
  /** Date de l'AG qui ouvre le cycle, ISO. */
  dateAgISO: string;
  debutISO: string;
  finISO: string;
  honorairesGestionTtc: number;
  forfaitPostauxTtc: number;
  /** Defaut : false (forfait). */
  fraisPostauxReels?: boolean;
}

/** Toutes les valeurs du document, pretes a rendre. */
export interface ChampsContrat {
  copro: CoproContrat;
  /** Dates du cycle, en ISO (la mise en forme se fait a l'affichage). */
  dateAgISO: string;
  debutISO: string;
  finISO: string;
  /** "1 an, 0 mois, 0 jour" - le placeholder `[DureeContrat]` du legacy. */
  dureeTexte: string;
  /** Honoraires de gestion : TTC saisi, HT calcule. */
  honorairesGestionTtc: number;
  honorairesGestionHt: string;
  /** Forfait timbres annuel TTC (pas de HT dans le legacy : il l'injecte brut). */
  forfaitPostauxTtc: number;
  /**
   * Frais postaux au REEL (rembourses sur justificatif) plutot qu'au forfait. Change trois
   * phrases du § 7.1.5 (modele « CONTRAT DE SYNDIC 2026_ReelFraisPostaux » du patron,
   * 15/09/2026). Defaut : forfait.
   */
  fraisPostauxReels: boolean;
  /** Annee du bareme applique : celle de l'AG, pas du debut du cycle (regle MYTHEC). */
  anneeBareme: number;
  /** Les 21 prestations, dans l'ordre du document. */
  tarifs: TarifContrat[];
  /**
   * Conditions particulieres negociees (une offre a un prospect : une clause, une ligne ou
   * deux que le gabarit n'a pas). Texte libre, un paragraphe par ligne ; absent = rien.
   */
  conditionsParticulieres?: string;
}

/**
 * Assemble les champs du contrat. Fonction PURE : elle ne lit ni base ni horloge,
 * tout lui est fourni. `tarifsTtc` doit porter les 21 prestations - c'est au service
 * de les avoir exigees au bareme, et de lever si l'une manque.
 */
export function assemblerChampsContrat(
  copro: CoproContrat,
  cycle: CycleContratChamps,
  tarifsTtc: Record<PrestationContrat, { libelle: string; ttc: number }>,
  conditionsParticulieres?: string,
): ChampsContrat {
  const manquantes = PRESTATIONS_CONTRAT.filter((p) => tarifsTtc[p] === undefined);
  if (manquantes.length > 0) {
    throw new Error(`Contrat de syndic : prestations absentes du bareme (${manquantes.join(", ")}).`);
  }

  return {
    copro,
    dateAgISO: cycle.dateAgISO,
    debutISO: cycle.debutISO,
    finISO: cycle.finISO,
    dureeTexte: dureeContratTexte(cycle.debutISO, cycle.finISO),
    honorairesGestionTtc: cycle.honorairesGestionTtc,
    honorairesGestionHt: htDepuisTtc(cycle.honorairesGestionTtc),
    forfaitPostauxTtc: cycle.forfaitPostauxTtc,
    fraisPostauxReels: cycle.fraisPostauxReels ?? false,
    // Le flow MYTHEC lisait les tarifs sur `formatDateTime(date AG, 'yyyy')` : une AG
    // vote au tarif de SON annee, meme si le mandat demarre en janvier suivant. Porte
    // d'abord sur le debut du cycle, corrige le 14/09/2026 (Sekou : des contrats
    // « en attente du bareme 2027 » pour des AG d'octobre 2026).
    anneeBareme: Number(cycle.dateAgISO.slice(0, 4)),
    tarifs: PRESTATIONS_CONTRAT.map((identifiant) => {
      const { libelle, ttc } = tarifsTtc[identifiant];
      return { identifiant, libelle, ttc, ht: htDepuisTtc(ttc), ttcTexte: ttcBrut(ttc) };
    }),
    ...(conditionsParticulieres?.trim() ? { conditionsParticulieres: conditionsParticulieres.trim() } : {}),
  };
}
