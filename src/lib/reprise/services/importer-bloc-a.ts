// Service d'IMPORT du BLOC A (classes 4 et 5 : tiers + tresorerie) vers eStale - increment 3.
//
// C'est le premier service de la reprise qui ECRIT. Il compose, dans cet ordre :
//   1. les controles PURS (plan pret a importer, jeu non vide, chaque compte source resolu) ;
//   2. le PREREQUIS D'ETAT (verifierPrerequisImport : un exercice existant, ni verrouille ni
//      clos, pour CHAQUE date qu'on s'apprete a ecrire) ;
//   3. la resolution nomenclature -> AccountingAccount.id (createEntryExpert exige un
//      accountID, pas une nomenclature) ;
//   4. l'emission ligne a ligne via le port d'ecriture, id capture a chaque fois ;
//   5. facultativement, la relecture de balance (verifierBalanceCompta).
//
// REGLE CARDINALE : tout ce qui peut etre refuse l'est AVANT la premiere mutation. La sonde
// SE999 (2026-08-18) a montre qu'eStale refuse avec une erreur opaque ("Oupss") - decouvrir un
// refus au milieu de 300 mutations laisserait un import a moitie fait, donc une compta fausse.
// Un { ok:false } de ce service garantit qu'AUCUNE ecriture n'a ete emise.
//
// DRY-RUN PAR DEFAUT : le provider d'ecriture vient du routeur, qui ne choisit l'adapter reel
// que si ESTALE_ECRITURE=reel. Ce service ne lit jamais l'environnement lui-meme.
//
// ARRET + ROLLBACK : a la premiere erreur d'ecriture, on ARRETE (on ne tente pas la suite) et le
// rapport porte les ids deja crees, dans l'ordre INVERSE, pret pour annulerImport().
//
// PII : le libelle d'une ecriture peut porter un nom (il part vers eStale, c'est son role) mais
// il n'entre JAMAIS dans le rapport ni dans une note - seuls numeros de compte, ids techniques,
// compteurs et montants agreges y figurent.

import type { JeuEcritures, LigneEcriture } from "@/lib/reprise/domain/ecriture";
import { deriverJournal } from "@/lib/reprise/domain/journal-reprise";
import type { ClasseComptable, SoldeCompte } from "@/lib/reprise/domain/compta";
import type { EntreeMapping, PlanMapping } from "@/lib/reprise/domain/mapping-compta";
import type { EntreeMappingResolue } from "@/lib/reprise/domain/decisions-mapping";
import type {
  EstaleComptaLectureProvider,
  RefAccounting,
} from "@/lib/reprise/ports/estale-compta-lecture-provider";
import type {
  EcritureExpertEstale,
  EstaleComptaEcritureProvider,
  JournalEcriture,
} from "@/lib/reprise/ports/estale-compta-ecriture-provider";
import {
  getEstaleComptaEcritureProvider,
  getEstaleComptaLectureProvider,
} from "@/lib/reprise/adapters/router";
import { verifierPrerequisImport } from "@/lib/reprise/services/prerequis-import";
import { verifierBalanceCompta, type ResultatBalance } from "@/lib/reprise/services/verifier-balance-compta";

/**
 * Journal (EntryLedger) de repli quand la cible du plan n'en porte pas. Le plan de mapping pose
 * "carryforward" (a-nouveaux) sur toutes ses cibles ; "general" ne sert donc qu'aux plans
 * fabriques/persistes sans journal.
 *
 * A VALIDER PAR SEKOU (question metier NON tranchee ici, remontee dans rapport.aValider) : est-ce
 * que TOUTES les ecritures reprises du bloc A doivent aller en "carryforward", ou seulement les
 * reports d'ouverture, le mouvement de l'exercice partant en "general" / "bank" / "purchase" ?
 * Ce service applique ce que le plan dit, il ne decide pas a la place du comptable.
 */
export const JOURNAL_DEFAUT: JournalEcriture = "general";

/** Classes du bloc A (tiers et tresorerie) - le perimetre de cet import. */
const CLASSES_BLOC_A: ClasseComptable[] = [4, 5];

/** Une ecriture effectivement emise, avec l'id capture (materiel du rollback). */
export interface EcritureEmise {
  /** Numero d'ordre 1-based dans l'emission. */
  seq: number;
  /** Id eStale de l'ecriture creee (Entry.id), capture pour rollback. */
  id: string;
  /** Compte tel que le grand livre source le nomme. */
  compteSource: string;
  /** Compte eStale vise (AccountingAccount.id). */
  accountID: string;
  classe: ClasseComptable;
}

export interface RapportImportBlocA {
  coproCode: string;
  condoID: string;
  /** true si TOUTES les lignes retenues ont ete emises sans erreur. */
  succes: boolean;
  /** Les ecritures emises, dans l'ordre d'emission. */
  emises: EcritureEmise[];
  /** Ids captures, dans l'ordre d'emission : l'entree de annulerImport(). */
  ids: string[];
  /** Les memes ids en ordre INVERSE (ordre reel de suppression), pour affichage / defaire a la main. */
  rollback: string[];
  compteurs: {
    /** Lignes de classe 4/5 presentes dans le jeu. */
    lignesBlocA: number;
    /** Lignes ecartees parce que leur compte source est explicitement ignore (decision humaine). */
    lignesIgnorees: number;
    /** Lignes qu'on a cherche a emettre. */
    aEmettre: number;
    /** Lignes reellement emises (== aEmettre si succes). */
    emises: number;
    /** Emises par classe comptable. */
    parClasse: Record<4 | 5, number>;
    /** Comptes source distincts effectivement vises. */
    comptesSource: number;
    /** Comptes eStale cibles distincts. */
    comptesCibles: number;
  };
  /** Totaux des montants emis, par sens (controle grossier cote appelant). */
  totaux: { debit: number; credit: number };
  /** Nombre d'ecritures emises par journal eStale (la question metier ouverte). */
  parJournal: Record<string, number>;
  /** Points a TRANCHER par un humain (dont le journal). PII-free. */
  aValider: string[];
  /** Notes informatives PII-free. */
  notes: string[];
  /** Renseigne uniquement si l'emission s'est arretee sur une erreur. */
  erreur?: { seq: number; compteSource: string; message: string };
  /** Relecture de balance (si options.relireBalance) - en dry-run elle lit le mock. */
  balanceApres?: ResultatBalance;
}

/**
 * `ok:false` = REFUS : rien n'a ete emis, `motifs` dit quoi corriger.
 * `ok:true`  = l'emission a ete tentee ; `rapport.succes` dit si elle est allee au bout.
 */
export type ResultatImportBlocA =
  | { ok: false; message: string; motifs: string[] }
  | { ok: true; rapport: RapportImportBlocA };

export interface OptionsImportBlocA {
  /** Port de LECTURE (prerequis, plan comptable, balance). Defaut : routeur. */
  lecture?: EstaleComptaLectureProvider;
  /** Port d'ECRITURE. Defaut : routeur -> DRY-RUN tant que ESTALE_ECRITURE != reel. */
  ecriture?: EstaleComptaEcritureProvider;
  /** Relire la balance apres l'emission (utile en reel ; en dry elle lit le mock). */
  relireBalance?: boolean;
  /**
   * Date ISO des lignes d'A-NOUVEAU (1er jour de l'exercice, ex. "2026-01-01"). Quand elle
   * est fournie, les reports captures par le parseur (jeu.controles) deviennent des lignes
   * d'ouverture du bloc A, emises en carryforward (aucune contrepartie -> repli du plan).
   * Sans elle : mouvements seuls (les cibles par compte de la balance de bascule ne seront
   * PAS atteintes - les soldes incluent les reports).
   */
  aNouveauxDate?: string;
}

/** Entree de plan, eventuellement enrichie d'une decision humaine (flag `ignore`). */
type EntreePlan = EntreeMapping & Pick<EntreeMappingResolue, "ignore">;

/** Cible d'ecriture entierement resolue pour un compte source. */
interface CibleResolue {
  accountID: string;
  nomenclature: string;
  journal: JournalEcriture;
  dkID?: string;
}

function refus(message: string, motifs: string[] = []): ResultatImportBlocA {
  return { ok: false, message, motifs };
}

/** Arrondi comptable au centime (les totaux du rapport ne doivent pas trainer de bruit flottant). */
function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Importe le BLOC A (classes 4/5) du jeu extrait vers la copro eStale, selon le PLAN valide.
 *
 * Le plan attendu est celui d'APRES la revue humaine (appliquerDecisions) : c'est lui qui porte
 * `pretAImporter`, les cibles et les eventuels comptes `ignore`. On ne rejoue aucune decision
 * ici - ce service execute, il ne decide pas.
 *
 * Ne LEVE jamais : tout echec devient soit un refus ({ ok:false }), soit un rapport d'arret
 * ({ ok:true, rapport.succes:false }) portant les ids a defaire.
 */
export async function importerBlocA(
  jeu: JeuEcritures,
  plan: PlanMapping,
  coproCode: string,
  options: OptionsImportBlocA = {},
): Promise<ResultatImportBlocA> {
  const lecture = options.lecture ?? getEstaleComptaLectureProvider();
  const ecriture = options.ecriture ?? getEstaleComptaEcritureProvider();

  // --- 1. Controles PURS (gratuits : aucun reseau, aucun risque) -------------------

  if (jeu.lignes.length === 0) {
    return refus(
      "Aucune ecriture dans le jeu extrait : le grand livre n'a pas ete lu (format non reconnu " +
        "ou document vide). Consulter les notes d'extraction avant tout import.",
    );
  }

  // Lignes d'OUVERTURE synthetisees depuis les reports a-nouveau captures (option) : un
  // report debit ET un report credit donnent chacun leur ligne. Pas de contrepartie -> le
  // journal repliera sur celui du plan (carryforward), exactement la nature d'un a-nouveau.
  const lignesOuverture: LigneEcriture[] = [];
  if (options.aNouveauxDate) {
    for (const c of jeu.controles ?? []) {
      const classe = Number(c.compte.replace(/[^0-9]/g, "")[0] ?? "0") as LigneEcriture["classe"];
      if (!CLASSES_BLOC_A.includes(classe)) continue;
      for (const [sens, montant] of [
        ["debit", c.reportDebit ?? 0],
        ["credit", c.reportCredit ?? 0],
      ] as const) {
        if (Math.abs(montant) < 0.005) continue;
        lignesOuverture.push({
          date: options.aNouveauxDate,
          compte: c.compte,
          libelle: `A-nouveau au ${options.aNouveauxDate} (reprise)`,
          sens,
          montant: Math.abs(montant),
          classe,
        });
      }
    }
  }

  const lignesBlocA = [
    ...lignesOuverture,
    ...jeu.lignes.filter((l) => CLASSES_BLOC_A.includes(l.classe)),
  ];
  if (lignesBlocA.length === 0) {
    return refus(
      "Aucune ecriture de classe 4 ou 5 dans le jeu : le bloc A (tiers et tresorerie) est vide, " +
        "il n'y a rien a importer. Verifier que le grand livre fourni est bien le grand livre complet.",
    );
  }

  if (!plan.pretAImporter) {
    return refus(
      "Le plan de mapping n'est PAS pret a importer : chaque erreur et chaque appariement en " +
        "attente doit etre tranche dans l'ecran de revue avant d'ecrire dans eStale.",
      [...plan.erreurs, ...plan.warnings],
    );
  }

  // --- 2. Chaque compte source du bloc A doit etre resolu par le plan --------------
  // On refuse EN BLOC (tous les motifs d'un coup) : un import qui echoue compte par compte
  // ferait revenir l'humain autant de fois qu'il y a de comptes a corriger.

  const parCompteSource = new Map<string, EntreePlan>();
  for (const e of plan.entrees as EntreePlan[]) parCompteSource.set(e.compteSource, e);

  const comptesDuBlocA = [...new Set(lignesBlocA.map((l) => l.compte))];
  const motifs: string[] = [];
  const comptesIgnores = new Set<string>();
  const cibleParCompteSource = new Map<string, { nomenclature: string; journal: JournalEcriture }>();

  for (const compteSource of comptesDuBlocA) {
    const entree = parCompteSource.get(compteSource);
    if (!entree) {
      motifs.push(
        `compte ${compteSource} : absent du plan de mapping (le plan ne couvre pas le jeu fourni - ` +
          `rejouer le mapping sur CE grand livre).`,
      );
      continue;
    }
    if (entree.ignore) {
      comptesIgnores.add(compteSource);
      continue;
    }
    if (entree.statut !== "mappe" || !entree.cible) {
      motifs.push(
        `compte ${compteSource} : statut "${entree.statut}" - seul un compte "mappe" avec une cible ` +
          `eStale s'importe ici` +
          (entree.statut === "action_requise"
            ? " (creation de fournisseur / sous-compte a executer AVANT, hors perimetre de ce service)."
            : "."),
      );
      continue;
    }
    cibleParCompteSource.set(compteSource, {
      nomenclature: entree.cible.nomenclature,
      // Le plan pose "carryforward" ; le repli ne sert qu'a un plan persiste sans journal.
      journal: entree.cible.journal ?? JOURNAL_DEFAUT,
    });
  }

  if (motifs.length > 0) {
    return refus(
      "Le plan ne resout pas tous les comptes du bloc A : AUCUNE ecriture n'a ete emise.",
      motifs,
    );
  }

  const lignesRetenues = lignesBlocA.filter((l) => !comptesIgnores.has(l.compte));
  if (lignesRetenues.length === 0) {
    return refus(
      "Toutes les lignes du bloc A relevent de comptes explicitement ignores a la revue : " +
        "il ne reste rien a importer.",
    );
  }

  // --- 3. Etat eStale : copro, prerequis d'exercices, plan comptable ---------------

  let ref: RefAccounting | null;
  let comptesEstale: SoldeCompte[];
  try {
    ref = await lecture.resoudreAccounting(coproCode);
    if (!ref) {
      return refus(
        `Copro "${coproCode}" introuvable dans eStale ou sans exercice comptable ouvert.`,
      );
    }

    // PREREQUIS D'ETAT en tete, sur les SEULES dates qu'on va ecrire (le bloc B/C n'est pas
    // du voyage : une date de classe 6 hors exercice ne doit pas bloquer le bloc A).
    const prerequis = await verifierPrerequisImport(
      { ...jeu, lignes: lignesRetenues },
      coproCode,
      lecture,
    );
    if (!prerequis.ok) return refus(prerequis.message);
    if (!prerequis.verdict.ok) {
      return refus(
        "Prerequis d'exercices eStale NON satisfait : l'import est refuse avant toute ecriture " +
          "(eStale refuserait de toute facon, avec une erreur opaque).",
        prerequis.verdict.motifs,
      );
    }

    comptesEstale = await lecture.lireComptes(ref);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return refus(`Etat eStale non verifiable pour "${coproCode}" : ${message}`);
  }

  // --- 4. Resolution nomenclature -> AccountingAccount.id --------------------------
  // createEntryExpert prend un accountID. Le plan, lui, ne connait que des NOMENCLATURES :
  // c'est ici que les deux se rejoignent, et c'est le dernier point ou l'on peut refuser
  // proprement. Une cible sans id est BLOQUANTE, jamais un "on verra en cours de route".

  const compteParNomenclature = new Map<string, SoldeCompte>();
  for (const c of comptesEstale) compteParNomenclature.set(c.nomenclature.trim(), c);

  const resolues = new Map<string, CibleResolue>();
  const sansDk: string[] = [];
  for (const [compteSource, cible] of cibleParCompteSource) {
    const compte = compteParNomenclature.get(cible.nomenclature.trim());
    if (!compte) {
      motifs.push(
        `compte ${compteSource} -> cible ${cible.nomenclature} : cette nomenclature n'existe pas ` +
          `dans le plan comptable eStale de la copro (compte a creer, ou cible a corriger a la revue).`,
      );
      continue;
    }
    if (!compte.id) {
      motifs.push(
        `compte ${compteSource} -> cible ${cible.nomenclature} : compte eStale sans id ` +
          `(AccountingAccount.id absent de la lecture) - impossible d'ecrire dessus.`,
      );
      continue;
    }
    if (!compte.dkID) sansDk.push(cible.nomenclature);
    resolues.set(compteSource, {
      accountID: compte.id,
      nomenclature: compte.nomenclature,
      journal: cible.journal,
      // La cle de repartition est celle PORTEE PAR LE COMPTE eStale, pas le code "001" du plan
      // (convention cabinet, pas un ID eStale).
      ...(compte.dkID ? { dkID: compte.dkID } : {}),
    });
  }

  if (motifs.length > 0) {
    return refus(
      "Resolution des comptes eStale incomplete : AUCUNE ecriture n'a ete emise.",
      motifs,
    );
  }

  // Appariement ligne <-> cible fait AVANT la boucle d'emission : plus aucune ligne ne peut se
  // retrouver sans cible au moment d'ecrire (pas de "skip" silencieux en plein import).
  const aEmettre: { ligne: LigneEcriture; cible: CibleResolue }[] = [];
  for (const ligne of lignesRetenues) {
    const cible = resolues.get(ligne.compte);
    if (cible) aEmettre.push({ ligne, cible });
  }
  if (aEmettre.length !== lignesRetenues.length) {
    return refus(
      "Incoherence interne : des lignes du bloc A n'ont pas de cible resolue. Aucune ecriture emise.",
      [`${lignesRetenues.length - aEmettre.length} ligne(s) sans cible apres resolution.`],
    );
  }

  // --- 5. Emission ligne a ligne, id capture, ARRET a la 1re erreur ----------------

  const emises: EcritureEmise[] = [];
  const ids: string[] = [];
  const parClasse: Record<4 | 5, number> = { 4: 0, 5: 0 };
  const parJournal: Record<string, number> = {};
  let debit = 0;
  let credit = 0;
  let erreur: RapportImportBlocA["erreur"];
  let seq = 0;

  let replisJournal = 0;
  for (const { ligne, cible } of aEmettre) {
    seq += 1;
    // Journal derive de la CONTREPARTIE imprimee (decision Sekou 2026-08-18 : les mouvements
    // gardent leur nature - bank/purchase/fundraising). Contrepartie absente ou qui ne
    // tranche pas -> repli sur le journal du plan (carryforward), COMPTE et VISIBLE en note.
    const journalDerive = deriverJournal(ligne.compte, ligne.contrepartie);
    if (journalDerive === null) replisJournal += 1;
    const input: EcritureExpertEstale = {
      condoID: ref.condoID,
      date: ligne.date,
      libelle: ligne.libelle,
      montant: ligne.montant,
      mouvement: ligne.sens,
      journal: journalDerive ?? cible.journal,
      accountID: cible.accountID,
      ...(cible.dkID ? { dkID: cible.dkID } : {}),
      ...(ligne.piece ? { piece: ligne.piece } : {}),
    };
    try {
      const { id } = await ecriture.creerEcriture(input);
      ids.push(id);
      emises.push({
        seq,
        id,
        compteSource: ligne.compte,
        accountID: cible.accountID,
        classe: ligne.classe,
      });
      if (ligne.classe === 4 || ligne.classe === 5) parClasse[ligne.classe] += 1;
      parJournal[input.journal] = (parJournal[input.journal] ?? 0) + 1;
      if (ligne.sens === "debit") debit += ligne.montant;
      else credit += ligne.montant;
    } catch (e) {
      // ARRET NET : on ne tente pas la suite. Poursuivre remplirait eStale d'ecritures alors
      // qu'on ne sait pas pourquoi la precedente a ete refusee (erreur opaque cote eStale).
      erreur = {
        seq,
        compteSource: ligne.compte,
        message: e instanceof Error ? e.message : String(e),
      };
      break;
    }
  }

  const succes = erreur === undefined;

  // --- 6. Rapport -----------------------------------------------------------------

  const journaux = Object.keys(parJournal);
  const aValider: string[] = [];
  // Question du journal TRANCHEE (Sekou 2026-08-18) : les mouvements gardent leur nature,
  // derivee de la contrepartie ; repli carryforward quand elle ne tranche pas - jamais
  // silencieux, le compte des replis est ci-dessous.
  if (replisJournal > 0) {
    aValider.push(
      `${replisJournal} ligne(s) sans journal derivable (contrepartie absente ou ambigue) -> ` +
        `repli sur le journal du plan. ` +
        `Journaux emis : ${journaux.map((j) => `${j} (${parJournal[j]})`).join(", ") || "(aucun)"}.`,
    );
  }
  if (sansDk.length > 0) {
    aValider.push(
      `${sansDk.length} compte(s) cible sans cle de repartition (dkID) cote eStale : les ecritures ` +
        `correspondantes partent SANS dkID (eStale appliquera son defaut). Comptes : ${sansDk
          .slice(0, 5)
          .join(", ")}${sansDk.length > 5 ? ", ..." : ""}.`,
    );
  }

  const notes: string[] = [
    ...(lignesOuverture.length > 0
      ? [
          `${lignesOuverture.length} ligne(s) d'a-nouveau generee(s) depuis les reports captures ` +
            `(date ${options.aNouveauxDate}) et emise(s) en carryforward.`,
        ]
      : []),
    `Journaux emis (derives de la contrepartie, decision Sekou 2026-08-18) : ${
      journaux.map((j) => `${j} (${parJournal[j]})`).join(", ") || "(aucune ecriture)"
    }${replisJournal > 0 ? ` - dont ${replisJournal} repli(s) sur le journal du plan` : ""}.`,
    `Cle de repartition : reprise du dkID PORTE PAR LE COMPTE eStale cible (le code de cle du plan, ` +
      `convention cabinet, n'est pas un ID eStale).`,
  ];
  if (comptesIgnores.size > 0) {
    notes.push(
      `${comptesIgnores.size} compte(s) source ignore(s) a la revue : leurs lignes ne sont pas importees.`,
    );
  }
  if (!succes) {
    notes.push(
      `Import ARRETE a la ligne ${erreur?.seq} : ${ids.length} ecriture(s) deja creee(s) dans eStale. ` +
          `Utiliser annulerImport(rapport.ids) pour les defaire avant de reprendre.`,
    );
  }

  const rapport: RapportImportBlocA = {
    coproCode,
    condoID: ref.condoID,
    succes,
    emises,
    ids,
    rollback: [...ids].reverse(),
    compteurs: {
      lignesBlocA: lignesBlocA.length,
      lignesIgnorees: lignesBlocA.length - lignesRetenues.length,
      aEmettre: aEmettre.length,
      emises: emises.length,
      parClasse,
      comptesSource: new Set(emises.map((e) => e.compteSource)).size,
      comptesCibles: new Set(emises.map((e) => e.accountID)).size,
    },
    totaux: { debit: arrondi(debit), credit: arrondi(credit) },
    parJournal,
    aValider,
    notes,
    ...(erreur ? { erreur } : {}),
  };

  // --- 7. Relecture de balance (facultative) ---------------------------------------
  // En reel, c'est le controle final "la balance tombe-t-elle ?" ; en dry-run elle lit le mock
  // (sans interet, mais sans risque non plus).
  if (options.relireBalance && emises.length > 0) {
    rapport.balanceApres = await verifierBalanceCompta(coproCode, lecture);
  }

  return { ok: true, rapport };
}

/** Compte-rendu d'une annulation (rollback) d'import. */
export interface RapportAnnulation {
  /** Ids effectivement supprimes, dans l'ordre de suppression (inverse de la creation). */
  supprimes: string[];
  /** Ids dont la suppression a echoue, avec le motif. A defaire a la main dans eStale. */
  echecs: { id: string; message: string }[];
  /** true si tout a ete supprime. */
  complet: boolean;
}

/**
 * Annule un import en supprimant les ecritures creees, dans l'ordre INVERSE de leur creation
 * (comme le rollback patrimoine : on defait la derniere posee en premier).
 *
 * `ids` = les ids dans l'ORDRE DE CREATION (rapport.ids) : l'inversion est faite ICI, a un seul
 * endroit, pour qu'aucun appelant n'ait a y penser (rapport.rollback n'est que l'affichage de ce
 * meme ordre inverse).
 *
 * BEST-EFFORT ASSUME : un echec de suppression n'interrompt pas les suivants - laisser 200
 * ecritures en place parce que la 201e resiste serait pire. Ce qui a resiste est liste dans
 * `echecs`, a defaire a la main dans eStale.
 */
export async function annulerImport(
  ids: readonly string[],
  provider: EstaleComptaEcritureProvider = getEstaleComptaEcritureProvider(),
): Promise<RapportAnnulation> {
  const supprimes: string[] = [];
  const echecs: { id: string; message: string }[] = [];

  for (const id of [...ids].reverse()) {
    try {
      await provider.supprimerEcriture(id);
      supprimes.push(id);
    } catch (e) {
      echecs.push({ id, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return { supprimes, echecs, complet: echecs.length === 0 };
}
