// Les gestes sur un cycle, en PUR : chaque fonction rend ce qu'il faut écrire, l'écriture
// est l'affaire du service et de l'adapter. Les règles citées (D3 à D13) sont celles des
// directeurs, réunions des 06 et 07/06/2026 ; elles sont reprises, pas réinventées.
//
// La clôture, en une phrase : dater la TERMINALE clôt le cycle et ouvre le suivant dans le
// même geste (D3). Re-dater une terminale dont le suivant existe déjà n'ajuste que l'échéance
// de ce suivant, ses étapes sont des faits (D4, D9). Le gaz exige une offre, l'échéance en
// découle (D5, D10, D11). L'assurance saisit son échéance, l'offre y est facultative (D6, D12).
// Les CTQ reportent la date du contrôle sur l'appareil ou la copro, échéance à cinq ans.
//
// Qui produit le patch du contrat courant : `preparerCloture` ne le rend que pour la VMC (la
// seule où il a tout sous la main). Pour le gaz et l'assurance, le service relit l'offre et
// appelle `heritageOffreGaz` / `heritageOffreAssurance` : le domaine ne voit pas les offres.

import { estJourISO, plusAnnees, plusMois } from "./dates";
import { ETAPES, etapeTerminale, type Cycle, type NouveauCycle, type OffreAssurance, type OffreGaz, type PatchContratCourant, type SujetSuivi } from "./types";

export const DUREE_CTQ_ANNEES = 5;

/** D7 : une date d'étape est un jour passé ou le jour même, jamais une date future. */
export function verifierDateEtape(dateISO: string, aujourdhuiISO: string): string | null {
  if (!estJourISO(dateISO)) return "Date illisible : attendu un jour au format AAAA-MM-JJ.";
  if (dateISO > aujourdhuiISO) return "Une étape ne se date pas dans le futur.";
  return null;
}

/** D7 : on dé-coche une intermédiaire ou une post-terminale ; une terminale se re-date. */
export function peutEffacerEtape(sujet: SujetSuivi, cle: string): boolean {
  const def = ETAPES[sujet].find((e) => e.cle === cle);
  return !!def && !def.terminale;
}

export interface IntrantsEcheance {
  dateTerminaleISO: string;
  /** Gaz : la durée de l'offre retenue, en mois. */
  dureeMois?: number;
  /** Assurance : l'échéance saisie à la main (l'offre n'a pas de durée). */
  echeanceSaisieISO?: string;
}

/** L'échéance du cycle suivant ; null si l'intrant du sujet manque ou est illisible. */
export function echeanceApresCloture(sujet: SujetSuivi, p: IntrantsEcheance): string | null {
  if (!estJourISO(p.dateTerminaleISO)) return null;
  switch (sujet) {
    case "ctq_ascenseur":
    case "ctq_vmc":
      return plusAnnees(p.dateTerminaleISO, DUREE_CTQ_ANNEES);
    case "gaz":
      return p.dureeMois && p.dureeMois > 0 ? plusMois(p.dateTerminaleISO, p.dureeMois) : null;
    case "assurance":
      return estJourISO(p.echeanceSaisieISO) && p.echeanceSaisieISO > p.dateTerminaleISO ? p.echeanceSaisieISO : null;
  }
}

/** Ce que l'adapter écrit d'un seul tenant (miroir du `ClotureCycle` du port, défini ici). */
export interface PreparationCloture {
  /** Le cycle courant, terminale datée, statut « clos », offre retenue posée s'il y a lieu. */
  clos: Cycle;
  /** Le suivant à créer ; absent en re-clôture. */
  suivant?: NouveauCycle;
  /** En re-clôture : le suivant existant dont on ajuste la seule échéance. */
  suivantAjuste?: { id: string; sujet: SujetSuivi; echeanceISO: string | null };
}

export interface ParametresCloture {
  dateTerminaleISO: string;
  aujourdhuiISO: string;
  /** Gaz : obligatoire. Assurance : facultative ; absente en re-clôture = inchangée (D12). */
  offreRetenueId?: string | null;
  /** Gaz : durée de l'offre retenue, en mois (D5). */
  dureeMois?: number;
  /** Assurance : échéance saisie, future (D6, D12). */
  echeanceSaisieISO?: string;
  /** Le cycle suivant déjà en cours, s'il existe : on est alors en re-clôture (D4, D9). */
  suivantExistant?: Cycle | null;
}

export type ResultatCloture =
  | {
      ok: true;
      cloture: PreparationCloture;
      /** VMC : la date du contrôle à reporter sur la copro. */
      patchContrat?: PatchContratCourant;
      /** Ascenseur : la date du contrôle à reporter sur l'appareil. */
      nouveauDernierCtqISO?: string;
      /** Première clôture (le suivant est créé) ou re-clôture (le suivant est ajusté). */
      reCloture: boolean;
    }
  | { ok: false; erreur: string };

/** Prépare la clôture d'un cycle (première ou re-clôture) ; ne touche à rien. */
export function preparerCloture(cycle: Cycle, p: ParametresCloture): ResultatCloture {
  if (cycle.statut === "archive") return { ok: false, erreur: "Ce suivi est archivé : il ne se clôture pas." };

  const erreurDate = verifierDateEtape(p.dateTerminaleISO, p.aujourdhuiISO);
  if (erreurDate) return { ok: false, erreur: erreurDate };

  if (cycle.sujet === "gaz") {
    if (!p.offreRetenueId) return { ok: false, erreur: "Choisis l'offre retenue : l'échéance du contrat gaz dépend de sa durée." };
    if (!p.dureeMois || p.dureeMois <= 0) return { ok: false, erreur: "La durée de l'offre retenue est inconnue : impossible de calculer l'échéance." };
  }
  if (cycle.sujet === "assurance") {
    if (!estJourISO(p.echeanceSaisieISO)) return { ok: false, erreur: "Saisis l'échéance du nouveau contrat d'assurance." };
    if (p.echeanceSaisieISO <= p.aujourdhuiISO) return { ok: false, erreur: "L'échéance du nouveau contrat doit être dans le futur." };
  }

  const echeanceSuivante = echeanceApresCloture(cycle.sujet, p);
  if (!echeanceSuivante) return { ok: false, erreur: "Échéance du cycle suivant incalculable." };

  const terminale = etapeTerminale(cycle.sujet);
  const clos: Cycle = {
    ...cycle,
    statut: "clos",
    etapes: { ...cycle.etapes, [terminale.cle]: p.dateTerminaleISO },
  };
  if (cycle.sujet === "gaz" || cycle.sujet === "assurance") {
    // Gaz : toujours fournie. Assurance : l'absence préserve l'offre déjà retenue (D12).
    clos.offreRetenueId = p.offreRetenueId ?? cycle.offreRetenueId ?? null;
  }

  const suivant = p.suivantExistant ?? null;
  const cloture: PreparationCloture = suivant
    ? { clos, suivantAjuste: { id: suivant.id, sujet: suivant.sujet, echeanceISO: echeanceSuivante } }
    : {
        clos,
        suivant: {
          sujet: cycle.sujet,
          coproCode: cycle.coproCode,
          ...(cycle.ascenseurId ? { ascenseurId: cycle.ascenseurId } : {}),
          statut: "en_cours",
          echeanceISO: echeanceSuivante,
          etapes: {},
          demarreManuellement: null,
          offreRetenueId: null,
          notes: null,
        },
      };

  const base = { ok: true as const, cloture, reCloture: !!suivant };
  if (cycle.sujet === "ctq_vmc") return { ...base, patchContrat: { vmc: { dernierCtqISO: p.dateTerminaleISO } } };
  if (cycle.sujet === "ctq_ascenseur") return { ...base, nouveauDernierCtqISO: p.dateTerminaleISO };
  return base;
}

/**
 * D10, D11 : l'offre gaz élue recopie fournisseur, type de prix, montant et échéance sur le
 * contrat courant. C'est une copie, pas une référence : d'où l'interdiction d'éditer une offre
 * retenue (D13). En re-clôture, la nouvelle offre ré-hérite tout, sinon la copro la contredirait.
 */
export function heritageOffreGaz(o: OffreGaz, dateValidationISO: string): PatchContratCourant {
  return {
    gaz: {
      fournisseur: o.fournisseur,
      typePrix: o.typePrix,
      montant: o.montant,
      echeanceISO: plusMois(dateValidationISO, o.dureeMois),
    },
  };
}

/**
 * D12 : l'échéance saisie va toujours sur la copro ; la compagnie vient de l'offre s'il y en a
 * une (sans offre = reconduction, compagnie inchangée) ; le numéro de contrat n'est écrit que
 * s'il est fourni (D12-5 : on n'écrase jamais un numéro humain par une absence).
 */
export function heritageOffreAssurance(o: OffreAssurance | null, echeanceISO: string, numeroContrat?: string | null): PatchContratCourant {
  const numero = numeroContrat?.trim();
  return {
    assurance: {
      echeanceISO,
      ...(o ? { compagnie: o.assureur } : {}),
      ...(numero ? { numeroContrat: numero } : {}),
    },
  };
}

/** D13 : une offre retenue ne se retire pas ; message explicatif, null si le retrait est permis. */
export function peutRetirerOffre(cycle: Pick<Cycle, "offreRetenueId">, offreId: string): string | null {
  if (cycle.offreRetenueId && cycle.offreRetenueId === offreId) {
    return "Cette offre est celle retenue à la validation : elle ne se retire pas. Pour la corriger, saisis la bonne offre puis re-date la validation avec celle-ci.";
  }
  return null;
}

/** Le premier cycle d'une copro qui n'en avait pas : on « démarre le suivi », à la main. */
export function cycleInitial(p: { sujet: SujetSuivi; coproCode: string; echeanceISO: string | null; ascenseurId?: string }): NouveauCycle {
  return {
    sujet: p.sujet,
    coproCode: p.coproCode,
    ...(p.ascenseurId ? { ascenseurId: p.ascenseurId } : {}),
    statut: "en_cours",
    echeanceISO: p.echeanceISO,
    etapes: {},
    demarreManuellement: true,
    offreRetenueId: null,
    notes: null,
  };
}

/** « Démarrer le suivi » sur un cycle d'amorçage : il sort de l'état replié, rien d'autre. */
export function demarrer(cycle: Cycle): Cycle {
  return { ...cycle, demarreManuellement: true };
}
