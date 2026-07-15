// Domaine PUR de l'application des DECISIONS humaines sur un plan de mapping (aucune I/O).
//
// L'increment 2 produit un PlanMapping (resolveur automatique, cf. domain/mapping-compta.ts).
// Cet increment ajoute la REVUE HUMAINE : le gestionnaire tranche les warnings d'appariement et
// les comptes non mappes depuis l'ecran de revue. Chaque geste devient une DecisionMapping, que
// l'on rejoue ici sur le plan pour recalculer statuts / erreurs / warnings / pretAImporter.
//
// Fonction reine : appliquerDecisions(plan, decisions) -> PlanMappingResolu. PURE et testable :
// meme plan + memes decisions => meme resultat. Aucune ecriture eStale (l'import reel viendra a
// l'increment suivant).
//
// PII : les DECISIONS peuvent porter un motif libre (ignorer). Ce motif circule vers la
// persistance et l'UI mais n'est JAMAIS recopie dans les messages/notes du plan (regle du
// domaine mapping-compta : seuls numeros de compte, scores et compteurs y figurent).

import {
  CLE_DEFAUT,
  JOURNAL_REPRISE,
  type CibleMapping,
  type EntreeMapping,
  type PlanMapping,
  type StatutMapping,
} from "@/lib/reprise/domain/mapping-compta";
import { messageAvantRepartition } from "@/lib/reprise/domain/controle-comptes";

/**
 * Geste humain applique a UN compte source lors de la revue.
 *   - valider_candidat    : accepter le candidat eStale propose (statut warning -> mappe) ;
 *   - choisir_cible       : mapper vers un autre compte eStale choisi a la main (-> mappe) ;
 *   - creer_fournisseur   : forcer la creation d'un fournisseur 401 (-> action_requise) ;
 *   - creer_compte_separe : creer un compte 450 SEPARE rattache a un owner eStale, pour un
 *                           coproprietaire a comptes multiples (pas de fusion) (-> action_requise) ;
 *   - coproprietaire_parti: le titulaire du compte 450 a VENDU en cours d'exercice (introuvable dans
 *                           eStale) -> ses ecritures vont sur un compte dedie 47x/46x "coproprietaires
 *                           partis" (nomenclature CIBLE saisie/choisie par le gestionnaire) (-> mappe) ;
 *   - ignorer             : ecarter volontairement le compte (trace par un motif).
 */
export type DecisionMapping =
  | { type: "valider_candidat" }
  | { type: "choisir_cible"; nomenclature: string }
  | { type: "creer_fournisseur" }
  | { type: "creer_compte_separe"; owner: string }
  | { type: "coproprietaire_parti"; nomenclature: string }
  | { type: "ignorer"; motif: string };

/** Une decision rattachee a son compte source (+ tracabilite : qui / quand). */
export interface DecisionEntree {
  /** Numero de compte source vise (cle de rattachement). */
  compteSource: string;
  /** Le geste applique. */
  decision: DecisionMapping;
  /** Identifiant technique du decideur (jamais un nom : id gestionnaire). Optionnel. */
  decideur?: string;
  /** Horodatage ISO de la decision. Optionnel. */
  decidedAt?: string;
}

/** Entree du plan enrichie de la decision humaine appliquee. */
export interface EntreeMappingResolue extends EntreeMapping {
  /** Decision humaine appliquee a cette entree (absente si aucune). */
  decision?: DecisionMapping;
  /** true si le compte est explicitement ignore (le motif vit dans `decision`). */
  ignore?: boolean;
}

/** Plan recalcule apres application des decisions humaines. */
export interface PlanMappingResolu extends PlanMapping {
  entrees: EntreeMappingResolue[];
  /** Nombre d'entrees restant a trancher (erreurs + warnings encore ouverts). */
  aTraiter: number;
  /** Nombre de decisions humaines effectivement appliquees. */
  decisionsAppliquees: number;
}

/** Fabrique une cible eStale (nomenclature + cle + journal de reprise par defaut). */
function cibleDe(nomenclature: string): CibleMapping {
  return { nomenclature, cle: CLE_DEFAUT, journal: JOURNAL_REPRISE };
}

/** Resultat de l'application d'une decision a une entree : entree transformee + applicabilite. */
interface Applique {
  entree: EntreeMappingResolue;
  /** true si la decision etait applicable a cette entree. */
  applique: boolean;
  /** Note PII-free si la decision etait inapplicable (a remonter dans le plan). */
  note?: string;
}

/** Applique UN geste a UNE entree. Ne mute pas l'entree source (renvoie une copie). */
function appliquerUneDecision(e: EntreeMapping, d: DecisionMapping): Applique {
  switch (d.type) {
    case "valider_candidat": {
      // On ne peut valider que s'il existe un candidat propose (cible presente).
      if (!e.cible) {
        return { entree: e, applique: false, note: `compte ${e.compteSource} : aucun candidat a valider` };
      }
      return {
        entree: { ...e, statut: "mappe", decision: d, note: "candidat eStale valide manuellement" },
        applique: true,
      };
    }
    case "choisir_cible": {
      // Mapping manuel : on ecrase la cible et on retire toute action planifiee.
      return {
        entree: {
          ...e,
          statut: "mappe",
          cible: cibleDe(d.nomenclature),
          action: undefined,
          decision: d,
          note: "compte cible eStale choisi manuellement",
        },
        applique: true,
      };
    }
    case "creer_fournisseur": {
      // Creation de fournisseur reservee aux comptes 401 (categorie fournisseur).
      if (e.categorie !== "fournisseur") {
        return {
          entree: e,
          applique: false,
          note: `compte ${e.compteSource} : creation fournisseur inapplicable (categorie ${e.categorie})`,
        };
      }
      return {
        entree: {
          ...e,
          statut: "action_requise",
          cible: undefined,
          action: { type: "creer_fournisseur", ...(e.intitule ? { intituleSource: e.intitule } : {}) },
          decision: d,
          note: "creation de fournisseur confirmee",
        },
        applique: true,
      };
    }
    case "creer_compte_separe": {
      // Reserve aux comptes 450 (coproprietaire) : creer un compte SEPARE plutot que fusionner
      // deux comptes source homonymes. Rattache a un owner eStale (owner = sa nomenclature 450).
      if (e.categorie !== "coproprietaire") {
        return {
          entree: e,
          applique: false,
          note: `compte ${e.compteSource} : compte separe inapplicable (categorie ${e.categorie})`,
        };
      }
      return {
        entree: {
          ...e,
          statut: "action_requise",
          cible: undefined,
          action: { type: "creer_compte_separe", ownerNomenclature: d.owner },
          decision: d,
          note: "compte separe planifie (rattache a un owner eStale)",
        },
        applique: true,
      };
    }
    case "coproprietaire_parti": {
      // Reserve aux comptes 450 (coproprietaire) : le titulaire a vendu en cours d'exercice et
      // n'existe plus dans eStale. Ses ecritures sont imputees a un compte DEDIE "coproprietaires
      // partis" (47x standard, decision cabinet ; 46x existant tolere). La nomenclature cible est
      // saisie/choisie par le gestionnaire (pas de numero fige) -> statut mappe. Le compte cible
      // est resolu/cree a l'import (Inc. 3), comme toute cible de mapping.
      if (e.categorie !== "coproprietaire") {
        return {
          entree: e,
          applique: false,
          note: `compte ${e.compteSource} : decision 'coproprietaire parti' inapplicable (categorie ${e.categorie})`,
        };
      }
      return {
        entree: {
          ...e,
          statut: "mappe",
          cible: cibleDe(d.nomenclature),
          action: undefined,
          decision: d,
          note: "coproprietaire parti (vendu) : ecritures imputees a un compte dedie 47x/46x",
        },
        applique: true,
      };
    }
    case "ignorer": {
      // Le motif reste dans la decision (PII possible) : jamais dans la note du plan.
      return {
        entree: { ...e, decision: d, ignore: true, note: "compte ignore volontairement (trace)" },
        applique: true,
      };
    }
  }
}

/** Compteurs vides (toutes les cles de statut a 0), local pour rester independant du domaine. */
function compteursVides(): Record<StatutMapping, number> {
  return {
    mappe: 0,
    action_requise: 0,
    warning_appariement: 0,
    reporte_bloc_b: 0,
    reporte_bloc_c: 0,
    non_mappe: 0,
  };
}

/**
 * Rejoue les DECISIONS humaines sur un plan et recalcule tout : statuts, compteurs, erreurs
 * (bloc A non mappe ET non ignore), warnings (appariements encore ouverts), notes, verdict
 * pretAImporter. Meme regle que construirePlan, avec en plus le respect du flag `ignore`
 * (un compte explicitement ignore sort des erreurs/warnings).
 *
 * Robuste : une decision qui reference un compte ABSENT du plan est ignoree, avec une note
 * PII-free (jamais d'exception). Idem pour une decision inapplicable (ex. creation fournisseur
 * sur un compte non 401) : l'entree reste inchangee et une note le signale.
 */
export function appliquerDecisions(plan: PlanMapping, decisions: DecisionEntree[]): PlanMappingResolu {
  const parCompte = new Map<string, DecisionMapping>();
  for (const d of decisions) parCompte.set(d.compteSource, d.decision);
  const connus = new Set(plan.entrees.map((e) => e.compteSource));

  const notesSupplementaires: string[] = [];
  for (const d of decisions) {
    if (!connus.has(d.compteSource)) {
      notesSupplementaires.push(`decision ignoree : compte ${d.compteSource} absent du plan courant`);
    }
  }

  const entrees: EntreeMappingResolue[] = [];
  let decisionsAppliquees = 0;
  for (const e of plan.entrees) {
    const d = parCompte.get(e.compteSource);
    if (!d) {
      entrees.push(e);
      continue;
    }
    const r = appliquerUneDecision(e, d);
    entrees.push(r.entree);
    if (r.applique) decisionsAppliquees++;
    else if (r.note) notesSupplementaires.push(r.note);
  }

  // Recalcul (parallele a construirePlan) : compteurs par statut, erreurs bloc A, warnings.
  const compteurs = compteursVides();
  const erreurs: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];

  for (const e of entrees) {
    compteurs[e.statut]++;
    if (e.ignore) continue; // tranche par un humain -> hors erreurs/warnings
    if (e.statut === "non_mappe") {
      erreurs.push(
        `compte ${e.compteSource} (classe ${e.classe}, ${e.categorie}) : bloc A non mappe et sans action planifiee -> ERREUR bloquante` +
          (e.note ? ` [${e.note}]` : ""),
      );
    } else if (e.statut === "warning_appariement") {
      warnings.push(
        `compte ${e.compteSource} (${e.categorie}) : appariement a valider, confiance ${
          e.confiance !== undefined ? e.confiance.toFixed(2) : "?"
        }` + (e.note ? ` [${e.note}]` : ""),
      );
    } else if (e.categorie === "regularisation_489") {
      notes.push(`compte ${e.compteSource} : 489 present -> decider s'il est repris (cf. equilibre).`);
    }
  }
  notes.push(...notesSupplementaires);

  // GARDE-FOU avant-repartition (bloquant STRICT) : si le plan porte le verdict, on prepend
  // l'erreur et on force pretAImporter = false. Aucun geste humain ne le leve (il faut le bon
  // grand livre). Rejoue ici pour survivre au recalcul cote client (appliquerDecisions).
  if (plan.avantRepartition?.avantRepartition) {
    erreurs.unshift(messageAvantRepartition(plan.avantRepartition));
  }

  const pretAImporter = erreurs.length === 0 && warnings.length === 0;
  return {
    entrees,
    compteurs,
    erreurs,
    warnings,
    notes,
    ...(plan.avantRepartition ? { avantRepartition: plan.avantRepartition } : {}),
    pretAImporter,
    aTraiter: erreurs.length + warnings.length,
    decisionsAppliquees,
  };
}
