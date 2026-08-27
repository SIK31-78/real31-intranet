// Domaine PUR du fichier d'import eStale entries.xlsx (feuille « Écritures ») - aucune I/O.
//
// Le module PRODUIT et CONTROLE ; il n'ecrit plus la compta par API (processus prouve S0303) :
// l'import se fait DANS L'UI eStale par le gestionnaire (module Expert, classes 4/5/6), puis
// le module VERIFIE par LECTURE. Les classes 1 et 7 ne passent JAMAIS par entries.xlsx :
// elles vont au module Eclatement (cf. domain/eclatements.ts).
//
// CONVENTION DE SIGNE (S0303) : Montant TTC, TVA, Deductible et Recuperable sont en VALEUR
// ABSOLUE ; le sens est porte par la colonne Type (debit | credit). Un montant signe sur une
// ligne credit risque la double negation.
//
// Autres regles encodees ici :
//   - journal de reprise = carryforward (a-nouveaux) ;
//   - la CLE de la ligne = la cle du COMPTE cible (001 par defaut) ;
//   - classe 6 : les colonnes TVA viennent du RGD apparie (le GL ne les porte pas) ;
//   - comptes d'attente agreges (4719999...) : le compte source est trace en Commentaire ;
//   - 489 exclu ; comptes ignores par decision humaine exclus (traces).

import type { ControleCompte, LigneEcriture } from "@/lib/reprise/domain/ecriture";
import type { PlanMapping } from "@/lib/reprise/domain/mapping-compta";
import type { EntreeMappingResolue } from "@/lib/reprise/domain/decisions-mapping";
import { apparierRgdGl, type LigneRgd } from "@/lib/reprise/domain/rgd";

/** Journaux acceptes par l'import eStale (releves dans le template entries.xlsx). */
export const JOURNAUX_ENTRIES = ["bank", "purchase", "carryforward", "general", "sale", "fundraising"] as const;
export type JournalEntry = (typeof JOURNAUX_ENTRIES)[number];

/** Limite dure d'eStale : 10 000 lignes par import (le template l'affiche en toutes lettres). */
export const LIMITE_LIGNES_IMPORT = 10_000;

/** Une ligne de la feuille « Écritures » (colonnes A..L du template). */
export interface LigneEntry {
  /** JJ/MM/AAAA, cellule TEXTE (le format qui casse les imports est la date convertie). */
  date: string;
  /** <= 180 caracteres. */
  libelle: string;
  /** <= 40 caracteres. */
  piece?: string;
  /** Journal eStale (carryforward pour la reprise). */
  journal?: JournalEntry;
  /** Nomenclature du compte CIBLE eStale (relevee, jamais devinee - R11). */
  compte: string;
  /** Code de cle 3 caracteres (la cle du COMPTE fait foi ; 001 par defaut). */
  cle?: string;
  type: "debit" | "credit";
  /** VALEUR ABSOLUE > 0 (le sens est dans `type`). */
  montantTTC: number;
  /** VALEUR ABSOLUE. */
  tva?: number;
  /** VALEUR ABSOLUE. */
  deductible?: number;
  /** VALEUR ABSOLUE. */
  recuperable?: number;
  /** <= 2000 caracteres (trace du compte source pour les agregats). */
  commentaire?: string;
}

/** Arrondi au centime. */
function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Date ISO (AAAA-MM-JJ) -> JJ/MM/AAAA (format du template). "" si inconvertible. */
export function dateVersEntries(iso: string): string {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Options de construction du fichier. */
export interface OptionsEntries {
  /**
   * Date (ISO AAAA-MM-JJ) a laquelle poser les REPORTS a-nouveaux repris en ecritures
   * carryforward. Obligatoire des qu'un compte mappe porte un report non nul.
   * Limite documentee : les reports d'un compte sont ACCUMULES (le detail "deux ouvertures"
   * d'un sortant lui-meme repreneur n'est pas re-eclate ici - a poser a la main si besoin).
   */
  dateOuverture?: string;
  /** Lignes RGD pour enrichir la classe 6 (TVA / deductible / recuperable). */
  rgd?: LigneRgd[];
}

/** Trace d'un compte source non repris dans le fichier. */
export interface ExclusionEntries {
  compte: string;
  motif: string;
  nbLignes: number;
}

export interface ResultatEntries {
  lignes: LigneEntry[];
  /** Comptes exclus du fichier (489, decisions "ignorer") - traces, jamais silencieux. */
  exclusions: ExclusionEntries[];
  /** Comptes routes vers la fiche d'eclatements (classes 1/7 et 2/3). */
  versEclatement: string[];
  /** Lignes GL classe 6 SANS ligne RGD appariee (TVA absente) - legitime pour les travaux. */
  sansRgd: number;
  warnings: string[];
  erreurs: string[];
  ok: boolean;
}

/** Categories dont le compte source est trace en Commentaire (agregation sur un meme compte cible). */
const CATEGORIES_TRACEES = new Set(["banque", "livret", "attente_ancien", "rompus_473"]);

/**
 * Construit les lignes du fichier entries.xlsx depuis le grand livre extrait et le plan de
 * mapping RESOLU (decisions humaines appliquees). Pur : meme entree => meme sortie.
 *
 * REFUSE (erreurs, lignes vides) si :
 *   - le plan n'est pas pretAImporter (warnings/erreurs restants) ;
 *   - un compte a des ecritures mais ni cible ni statut d'exclusion/eclatement ;
 *   - des reports non nuls existent sans dateOuverture.
 */
export function construireEntries(
  lignes: LigneEcriture[],
  controles: ControleCompte[],
  plan: PlanMapping,
  options: OptionsEntries = {},
): ResultatEntries {
  const erreurs: string[] = [];
  const warnings: string[] = [];
  const exclusions: ExclusionEntries[] = [];
  const versEclatement: string[] = [];
  const out: LigneEntry[] = [];

  if (!plan.pretAImporter) {
    return {
      lignes: [],
      exclusions: [],
      versEclatement: [],
      sansRgd: 0,
      warnings: [],
      erreurs: [
        `Plan de mapping non pret (${plan.erreurs.length} erreur(s), ${plan.warnings.length} warning(s)) : trancher la revue avant de produire entries.xlsx.`,
      ],
      ok: false,
    };
  }

  const parCompte = new Map<string, EntreeMappingResolue>();
  for (const e of plan.entrees) parCompte.set(e.compteSource, e as EntreeMappingResolue);

  // Appariement RGD (classe 6) : consommation unique, calcule une fois pour toutes les lignes.
  const appariement = options.rgd && options.rgd.length > 0 ? apparierRgdGl(lignes, options.rgd) : null;
  let sansRgd = 0;

  // Compte le nombre de lignes par compte pour tracer les exclusions.
  const nbParCompte = new Map<string, number>();
  for (const l of lignes) nbParCompte.set(l.compte, (nbParCompte.get(l.compte) ?? 0) + 1);

  const comptesEclatement = new Set<string>();
  const comptesExclus = new Map<string, string>(); // compte -> motif

  for (const [compte, entree] of parCompte) {
    if (entree.ignore) {
      comptesExclus.set(compte, "ignore volontairement (decision humaine tracee)");
      continue;
    }
    switch (entree.statut) {
      case "exclu":
        comptesExclus.set(compte, entree.note ?? "exclu du fichier d'import");
        break;
      case "reporte_bloc_c":
        comptesEclatement.add(compte);
        break;
      case "action_requise":
        erreurs.push(
          `compte ${compte} : action "${entree.action?.type ?? "?"}" a executer dans eStale AVANT la production (creer le tiers, relever sa reference, puis re-analyser).`,
        );
        break;
      case "mappe":
      case "reporte_bloc_b":
        if (!entree.cible) {
          erreurs.push(`compte ${compte} : statut ${entree.statut} sans cible eStale (plan incoherent).`);
        }
        break;
      default:
        // warning_appariement / non_mappe : impossibles si pretAImporter, mais on refuse net.
        erreurs.push(`compte ${compte} : statut ${entree.statut} non resolu (plan incoherent).`);
    }
  }

  // Reports a-nouveaux des comptes repris en ecritures.
  const dateOuverture = options.dateOuverture ? dateVersEntries(options.dateOuverture) : "";
  for (const c of controles) {
    const entree = parCompte.get(c.compte);
    if (!entree || entree.ignore) continue;
    if (entree.statut !== "mappe" && entree.statut !== "reporte_bloc_b") continue;
    const rd = arrondi(c.reportDebit ?? 0);
    const rc = arrondi(c.reportCredit ?? 0);
    if (rd === 0 && rc === 0) continue;
    if (!dateOuverture) {
      erreurs.push(
        `compte ${c.compte} : report a-nouveau non nul mais dateOuverture absente (fournir la date du 1er jour de l'exercice).`,
      );
      continue;
    }
    const cible = entree.cible!;
    const commentaire = `Report a-nouveau repris - compte source ${c.compte}`;
    if (rd !== 0) {
      out.push({
        date: dateOuverture,
        libelle: "Report a nouveau (reprise)",
        journal: "carryforward",
        compte: cible.nomenclature,
        cle: cible.cle,
        type: "debit",
        montantTTC: Math.abs(rd),
        commentaire,
      });
    }
    if (rc !== 0) {
      out.push({
        date: dateOuverture,
        libelle: "Report a nouveau (reprise)",
        journal: "carryforward",
        compte: cible.nomenclature,
        cle: cible.cle,
        type: "credit",
        montantTTC: Math.abs(rc),
        commentaire,
      });
    }
  }

  // Ecritures.
  lignes.forEach((l, index) => {
    const entree = parCompte.get(l.compte);
    if (!entree) {
      erreurs.push(`ecriture sur le compte ${l.compte} absent du plan de mapping (re-analyser).`);
      return;
    }
    if (entree.ignore || entree.statut === "exclu" || entree.statut === "reporte_bloc_c") return;
    if (entree.statut !== "mappe" && entree.statut !== "reporte_bloc_b") return; // deja en erreur
    const cible = entree.cible;
    if (!cible) return; // deja en erreur

    if (l.montant === 0) return; // une ligne a zero n'apporte rien et eStale la refuse
    const date = dateVersEntries(l.date);
    if (!date) {
      erreurs.push(`ecriture du compte ${l.compte} : date "${l.date}" inconvertible en JJ/MM/AAAA.`);
      return;
    }

    // Classe 6 : TVA / deductible / recuperable depuis la ligne RGD appariee (valeur ABSOLUE).
    let tva: number | undefined;
    let deductible: number | undefined;
    let recuperable: number | undefined;
    if (l.classe === 6) {
      const r = appariement?.parIndexGl.get(index);
      if (r) {
        if (r.tva !== undefined && r.tva !== 0) tva = arrondi(Math.abs(r.tva));
        if (r.deductible !== undefined && r.deductible !== 0) deductible = arrondi(Math.abs(r.deductible));
        if (r.recuperable !== undefined && r.recuperable !== 0) recuperable = arrondi(Math.abs(r.recuperable));
      } else if (appariement) {
        sansRgd++;
      }
    }

    const tracee = CATEGORIES_TRACEES.has(entree.categorie);
    out.push({
      date,
      libelle: l.libelle.slice(0, 180),
      ...(l.piece ? { piece: l.piece.slice(0, 40) } : {}),
      journal: "carryforward",
      compte: cible.nomenclature,
      cle: cible.cle,
      type: l.sens,
      montantTTC: arrondi(Math.abs(l.montant)),
      ...(tva !== undefined ? { tva } : {}),
      ...(deductible !== undefined ? { deductible } : {}),
      ...(recuperable !== undefined ? { recuperable } : {}),
      ...(tracee ? { commentaire: `Compte source ${l.compte}` } : {}),
    });
  });

  for (const [compte, motif] of comptesExclus) {
    exclusions.push({ compte, motif, nbLignes: nbParCompte.get(compte) ?? 0 });
  }
  for (const compte of comptesEclatement) versEclatement.push(compte);

  if (appariement && sansRgd > 0) {
    warnings.push(
      `${sansRgd} ecriture(s) de classe 6 sans ligne RGD appariee (TVA absente) : legitime pour les travaux (hors RGD), a verifier sinon.`,
    );
  }
  if (!appariement) {
    warnings.push(
      "RGD non fourni : les colonnes TVA / Deductible / Recuperable de la classe 6 restent vides (le grand livre ne les porte pas).",
    );
  }

  return {
    lignes: erreurs.length === 0 ? out : [],
    exclusions,
    versEclatement: versEclatement.sort(),
    sansRgd,
    warnings,
    erreurs,
    ok: erreurs.length === 0,
  };
}
