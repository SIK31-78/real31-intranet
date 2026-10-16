// La file « À compléter » d'une copropriété : ce qui manque pour que ses suivis tiennent
// debout. Fonction pure, une copro à la fois ; le service l'appelle sur le périmètre du
// gestionnaire et concatène.
//
// Les règles viennent des lecteurs de l'ancienne application (aCompleter.ts), relues à la
// lumière du plan (décision 8 : nettoyage des échéances aberrantes AVANT tout rappel par mail).
// Chaque ligne désigne UN champ à saisir, avec sa valeur actuelle quand elle existe, pour
// que l'écran puisse proposer l'édition en ligne.

import { estJourISO, formatJourFR, plusAnnees } from "./dates";
import { concerneSujet, estCourtierPartenaire, incoherencesCompteurs } from "./equipements";
import { LIBELLE_SUJET, type Ascenseur, type ContratCourant, type Cycle, type SujetSuivi } from "./types";

export type RubriqueACompleter =
  | "assurance"
  | "gaz"
  | "ctq_ascenseur"
  | "ctq_vmc"
  | "a_demarrer"
  | "appareil"
  | "compteur"
  | "immatriculation"
  | "conseil_syndical"
  | "echeance_aberrante";

export const LIBELLE_RUBRIQUE_A_COMPLETER: Record<RubriqueACompleter, string> = {
  assurance: "Assurance",
  gaz: "Contrat gaz",
  ctq_ascenseur: "CTQ ascenseur",
  ctq_vmc: "CTQ VMC gaz",
  a_demarrer: "Suivi à démarrer",
  appareil: "Appareil",
  compteur: "Compteurs d'équipement",
  immatriculation: "Immatriculation",
  conseil_syndical: "Conseil syndical",
  echeance_aberrante: "Échéance à vérifier",
};

export interface ItemACompleter {
  coproCode: string;
  coproNom: string;
  rubrique: RubriqueACompleter;
  sujet?: SujetSuivi;
  cycleId?: string;
  ascenseurId?: string;
  /** Le champ à saisir (clé stable pour l'édition en ligne). */
  champ: string;
  libelle: string;
  valeurActuelle?: string | null;
}

/** Au-delà de deux ans en arrière ou de quinze ans en avant, une échéance est un reste d'amorçage. */
export const ECHEANCE_ABERRANTE_PASSE_ANNEES = 2;
export const ECHEANCE_ABERRANTE_FUTUR_ANNEES = 15;

export function estEcheanceAberrante(echeanceISO: string, aujourdhuiISO: string): boolean {
  if (!estJourISO(echeanceISO)) return true;
  return echeanceISO < plusAnnees(aujourdhuiISO, -ECHEANCE_ABERRANTE_PASSE_ANNEES) || echeanceISO > plusAnnees(aujourdhuiISO, ECHEANCE_ABERRANTE_FUTUR_ANNEES);
}

export interface ContexteACompleter {
  copro: { code: string; nom: string; immatriculation?: string | null; immatriculationNonApplicable?: boolean | null };
  contrat: ContratCourant;
  /** Tous les cycles de la copro (les clos et archivés sont ignorés ici). */
  cycles: Cycle[];
  ascenseurs: Ascenseur[];
  partenaires: readonly string[];
  /** La cascade de destinataires de l'intranet connaît-elle une adresse du conseil syndical ? */
  csAdresseConnue: boolean;
  aujourdhuiISO: string;
}

export function calculerACompleter(p: ContexteACompleter): ItemACompleter[] {
  const items: ItemACompleter[] = [];
  const base = { coproCode: p.copro.code, coproNom: p.copro.nom };
  const ajouter = (i: Omit<ItemACompleter, "coproCode" | "coproNom">) => items.push({ ...base, ...i });

  const enCours = p.cycles.filter((c) => c.statut === "en_cours");
  const enCoursDe = (sujet: SujetSuivi) => enCours.filter((c) => c.sujet === sujet);
  const equipement = { contrat: p.contrat, nbAscenseurs: p.ascenseurs.length, partenaires: p.partenaires };
  const { assurance, gaz, compteurs } = p.contrat;

  // --- Assurance : rien à compléter chez un courtier partenaire, il s'en charge -------------
  if (!estCourtierPartenaire(assurance.courtier, p.partenaires)) {
    const cycle = enCoursDe("assurance")[0];
    if (cycle && !cycle.echeanceISO) {
      ajouter({ rubrique: "assurance", sujet: "assurance", cycleId: cycle.id, champ: "echeanceISO", libelle: "Échéance du contrat d'assurance" });
    }
    if (!assurance.compagnie) ajouter({ rubrique: "assurance", sujet: "assurance", champ: "compagnie", libelle: "Compagnie d'assurance" });
    if (!assurance.numeroContrat) ajouter({ rubrique: "assurance", sujet: "assurance", champ: "numeroContrat", libelle: "Numéro du contrat d'assurance" });
    if (!assurance.souscriptionISO) ajouter({ rubrique: "assurance", sujet: "assurance", champ: "souscriptionISO", libelle: "Date de souscription de l'assurance" });
    if (!assurance.courtier) ajouter({ rubrique: "assurance", sujet: "assurance", champ: "courtier", libelle: "Courtier (ou « en direct »)" });
  }

  // --- Appareils : un identifiant et une date de dernier contrôle par ascenseur -------------
  for (const a of p.ascenseurs) {
    // Une fiche totalement vide n'est un vrai appareil que si la copro déclare des ascenseurs.
    const fantome = !a.identifiant && !a.dernierCtqISO && (compteurs.ascenseurs ?? 0) === 0;
    if (fantome) continue;
    if (!a.identifiant) ajouter({ rubrique: "appareil", sujet: "ctq_ascenseur", ascenseurId: a.id, champ: "identifiant", libelle: "Identifiant de l'appareil" });
    if (!a.dernierCtqISO) {
      ajouter({ rubrique: "appareil", sujet: "ctq_ascenseur", ascenseurId: a.id, champ: "dernierCtqISO", libelle: `Date du dernier contrôle quinquennal${a.identifiant ? ` (${a.identifiant})` : ""}` });
    }
  }

  // --- VMC gaz : un cycle en cours sans échéance ------------------------------------------
  for (const c of enCoursDe("ctq_vmc")) {
    if (!c.echeanceISO) ajouter({ rubrique: "ctq_vmc", sujet: "ctq_vmc", cycleId: c.id, champ: "echeanceISO", libelle: "Échéance du contrôle de la VMC gaz" });
  }

  // --- Gaz : le contrat courant d'une copro qui a un cycle gaz en cours --------------------
  const cycleGaz = enCoursDe("gaz")[0];
  if (cycleGaz) {
    if (!gaz.fournisseur) ajouter({ rubrique: "gaz", sujet: "gaz", cycleId: cycleGaz.id, champ: "fournisseur", libelle: "Fournisseur de gaz" });
    if (!gaz.typePrix) ajouter({ rubrique: "gaz", sujet: "gaz", cycleId: cycleGaz.id, champ: "typePrix", libelle: "Type de prix (fixe ou variable)" });
    if (gaz.montant === null) ajouter({ rubrique: "gaz", sujet: "gaz", cycleId: cycleGaz.id, champ: "montant", libelle: "Montant annuel du contrat gaz" });
    if (!cycleGaz.echeanceISO) {
      ajouter({ rubrique: "gaz", sujet: "gaz", cycleId: cycleGaz.id, champ: "echeanceISO", libelle: "Échéance du contrat gaz" });
    } else if (cycleGaz.echeanceISO < p.aujourdhuiISO) {
      ajouter({
        rubrique: "gaz",
        sujet: "gaz",
        cycleId: cycleGaz.id,
        champ: "echeanceISO",
        libelle: `Échéance du contrat gaz dépassée (${formatJourFR(cycleGaz.echeanceISO)}) : le contrat a sûrement été renouvelé`,
        valeurActuelle: cycleGaz.echeanceISO,
      });
    }
  }

  // --- Compteurs : jamais renseignés, ou en désaccord avec ce qui est suivi ----------------
  const libelleCompteur: Record<keyof ContratCourant["compteurs"], string> = {
    ascenseurs: "Nombre d'ascenseurs",
    chaudieres: "Nombre de chaudières",
    vmcGaz: "Nombre de VMC gaz",
  };
  for (const champ of Object.keys(libelleCompteur) as (keyof ContratCourant["compteurs"])[]) {
    if (compteurs[champ] === null) ajouter({ rubrique: "compteur", champ, libelle: `${libelleCompteur[champ]} (0 si la copro n'en a pas)` });
  }
  for (const inc of incoherencesCompteurs({ contrat: p.contrat, nbAscenseurs: p.ascenseurs.length, nbCyclesVmc: enCoursDe("ctq_vmc").length })) {
    ajouter({ rubrique: "compteur", champ: inc.champ, libelle: inc.message, valeurActuelle: String(compteurs[inc.champ] ?? "") });
  }

  // --- Immatriculation : absente et pas marquée « sans objet » (ASL, immeuble sans logement) -
  if (!p.copro.immatriculation && !p.copro.immatriculationNonApplicable) {
    ajouter({ rubrique: "immatriculation", champ: "immatriculation", libelle: "Numéro d'immatriculation au registre national (ou cocher « sans objet »)" });
  }

  // --- Conseil syndical : sans adresse, aucun mail de comparatif ne peut partir --------------
  if (!p.csAdresseConnue) ajouter({ rubrique: "conseil_syndical", champ: "adresseCS", libelle: "Aucune adresse e-mail connue pour le conseil syndical" });

  // --- À démarrer : concernée par un sujet, aucun cycle en cours (l'assurance est à part) ---
  if (concerneSujet("gaz", equipement) && enCoursDe("gaz").length === 0) {
    ajouter({ rubrique: "a_demarrer", sujet: "gaz", champ: "demarrer", libelle: "Chaudières au gaz déclarées, aucun suivi du contrat gaz" });
  }
  if (concerneSujet("ctq_vmc", equipement) && enCoursDe("ctq_vmc").length === 0) {
    ajouter({ rubrique: "a_demarrer", sujet: "ctq_vmc", champ: "demarrer", libelle: "VMC gaz déclarée, aucun suivi du contrôle" });
  }
  if (concerneSujet("ctq_ascenseur", equipement)) {
    if (p.ascenseurs.length === 0) {
      ajouter({ rubrique: "a_demarrer", sujet: "ctq_ascenseur", champ: "demarrer", libelle: "Ascenseurs déclarés, aucun appareil créé : créer les appareils puis démarrer le suivi" });
    } else {
      for (const a of p.ascenseurs) {
        if (!enCoursDe("ctq_ascenseur").some((c) => c.ascenseurId === a.id)) {
          ajouter({ rubrique: "a_demarrer", sujet: "ctq_ascenseur", ascenseurId: a.id, champ: "demarrer", libelle: `Appareil ${a.identifiant ?? "sans identifiant"} : aucun suivi du contrôle quinquennal` });
        }
      }
    }
  }

  // --- Échéances aberrantes : les restes de l'amorçage (1906, 1930, 2017…), décision 8 ------
  for (const c of enCours) {
    if (c.echeanceISO && estEcheanceAberrante(c.echeanceISO, p.aujourdhuiISO)) {
      ajouter({
        rubrique: "echeance_aberrante",
        sujet: c.sujet,
        cycleId: c.id,
        ...(c.ascenseurId ? { ascenseurId: c.ascenseurId } : {}),
        champ: "echeanceISO",
        libelle: `${LIBELLE_SUJET[c.sujet]} : échéance ${formatJourFR(c.echeanceISO)} invraisemblable, à corriger avant tout rappel`,
        valeurActuelle: c.echeanceISO,
      });
    }
  }

  return items;
}
