// Orchestrateur de la reprise PATRIMOINE - entree par FICHIERS EXCEL (refonte 2026-08).
//
// AVANT : PDF du sortant -> extraction IA (Claude/Mistral) -> jeu -> auto-checks -> GO/STOP.
// APRES : le gestionnaire VERSE les 4 xlsx produits hors module (skill estale-migration :
//   lots.xlsx, tantiemes_<code>_*.xlsx, owners.xlsx, links en noms) -> le module les PARSE
//   (adapters/xlsx/parser-xlsx, miroir de la generation) et les VALIDE (auto-checks
//   deterministes) -> mini-recap GO/STOP -> injection eStale par API (ADR-030, inchangee).
//
// La generation des fichiers reste une etape SEPAREE (produirePhaseA, xlsx de repli pour
// un import manuel dans l'UI eStale) : on ne produit jamais sans GO explicite.

import type { JeuDeDonnees, Usage } from "@/lib/reprise/domain/patrimoine";
import { USAGES } from "@/lib/reprise/domain/patrimoine";
import type { CompteAvantRepartition, VerdictRaccordement } from "@/lib/reprise/domain/controle-comptes";
import { verifierTout, type ResultatChecks } from "@/lib/reprise/domain/auto-checks";
import { detecterDoublons } from "@/lib/reprise/domain/dedup";
import type { DocumentSource } from "@/lib/reprise/ports/document-source";
import { parserJeuDepuisXlsx } from "@/lib/reprise/adapters/xlsx/parser-xlsx";
import {
  genererPhaseA,
  genererPhaseABuffers,
  type FichierBuffer,
  type FichierGenere,
  type OptionsGeneration,
} from "@/lib/reprise/adapters/xlsx/generer-xlsx";

export interface RecapCle {
  code: string;
  libelle: string;
  totalAttendu: number;
  sommeCalculee: number;
  nbLots: number;
  ecart: number;
}

/** Etat de la liaison owners <-> comptes 450 (analyse unifiee avec grand livre). */
export interface RecapLiaison {
  /** Total d'owners traites. */
  total: number;
  /** Owners lies a un compte 450 (deterministe pour la compta). */
  lies: number;
  /** Owners a trancher (appariement ambigu / homonyme). */
  aTrancher: number;
  /** Owners sans compte 450 apparie. */
  sansCompte: number;
}

/** Resume de la reprise comptable (grand livre) pour le mini-recap GO/STOP. */
export interface RecapCompta {
  /** true si le grand livre est equilibre (total debit == total credit). */
  equilibre: boolean;
  /** Ecart signe totalDebit - totalCredit (0 si equilibre). */
  ecart: number;
  /** Nombre de comptes source distincts. */
  nbComptes: number;
  /** Nombre d'ecritures extraites. */
  nbEcritures: number;
  /**
   * Comptes de classe 6/7 avec report a-nouveau non nul. Present (et non vide) UNIQUEMENT si
   * detecte. SEMANTIQUE selon le GL : sur le GL CLOTURE = signature "grand livre AVANT
   * repartition" (bloquant : mauvais document... SAUF repartition comptabilisee en N+1 par le
   * sortant, remede = omission des paires, cf. domain/omission-paires) ; sur le GL EN COURS =
   * ANOMALIE (les reports 6/7 doivent repartir a zero apres cloture). PII-free.
   */
  avantRepartition?: CompteAvantRepartition[];
}

/** Mini-recap presente a l'humain pour decision GO/STOP (R3 : recap APRES analyse, AVANT production). */
export interface RecapPatrimoine {
  lots: { total: number; parUsage: Record<Usage, number> };
  cles: RecapCle[];
  owners: { total: number; sci: number; couples: number };
  attributions: { total: number; lotsOrphelins: number };
  fusionsProposees: number;
  doublonsNonTranchables: number;
  /** Notes de vigilance (parsing xlsx, liaison 450, grands livres). */
  notes: string[];
  checks: ResultatChecks;
  /** true si aucune ERREUR bloquante (le GO final reste humain). */
  pretAProduire: boolean;
  /**
   * Etat de la liaison owners <-> comptes 450. Present UNIQUEMENT si le jeu porte des liaisons
   * (analyse unifiee avec grand livre) ; absent pour le parcours patrimoine seul. Une liaison
   * ambigue NE BLOQUE PAS l'injection (pretAProduire inchange) : elle se tranche dans l'UI.
   */
  liaison?: RecapLiaison;
  /**
   * Resume de la reprise comptable de l'exercice CLOTURE (N-1). Renseigne par l'analyse unifiee,
   * PAS par calculerRecap (le grand livre ne vit pas dans le jeu patrimoine). Absent sans grand
   * livre. Historiquement nomme `compta` (retro-compat) = TOUJOURS l'exercice cloture.
   */
  compta?: RecapCompta;
  /**
   * Resume de la reprise comptable de l'exercice EN COURS. Present UNIQUEMENT quand un SECOND
   * grand livre a ete fourni et classe. Additif : un seul grand livre => absent. PII-free.
   */
  comptaEnCours?: RecapCompta;
  /**
   * Verdict du CONTROLE CROISE cloture <-> en cours : les a-nouveaux de l'en cours doivent
   * egaler les soldes finaux du cloture, compte par compte. Present UNIQUEMENT quand les DEUX
   * grands livres sont exploites. Un raccordement KO bloque l'import (cote plan de mapping).
   */
  raccordement?: VerdictRaccordement;
  /**
   * Erreur d'extraction du GRAND LIVRE (ex. couche texte inexploitable / scan). Present quand un
   * grand livre a ete joint mais que son extraction a echoue : le patrimoine reste analyse
   * (degradation PARTIELLE), le bloc compta affiche cette erreur au lieu de faire echouer tout
   * le dossier. PII-free (message technique).
   */
  comptaErreur?: string;
}

export interface AnalysePatrimoine {
  jeu: JeuDeDonnees;
  recap: RecapPatrimoine;
  /**
   * Erreurs STRUCTURELLES du parsing xlsx (colonnes manquantes, noms introuvables dans links,
   * fichier illisible...). Chacune est actionnable : elle dit quel fichier corriger et comment.
   * Vide dans le cas nominal. Distinctes des erreurs METIER (recap.checks.erreurs).
   */
  erreursParsing: string[];
}

/**
 * Derive le mini-recap GO/STOP depuis un jeu de donnees (compteurs, ecarts par cle,
 * auto-checks). `notes` reste vide : c'est a l'appelant de les re-injecter s'il les a
 * (le parseur les fournit ; une rehydratation depuis le jeu persiste ne les a plus).
 * Utilise a l'analyse ET a la rehydratation d'un dossier deja analyse (jeu persiste).
 */
export function calculerRecap(jeu: JeuDeDonnees): RecapPatrimoine {
  const parUsage = Object.fromEntries(USAGES.map((u) => [u, 0])) as Record<Usage, number>;
  for (const l of jeu.lots) parUsage[l.usage] = (parUsage[l.usage] ?? 0) + 1;

  const lotsAttribues = new Set(jeu.attributions.map((a) => a.lot));
  const cles: RecapCle[] = jeu.cles.map((c) => {
    const lignes = jeu.tantiemes.filter((t) => t.cleCode === c.code);
    const somme = lignes.reduce((s, t) => s + t.valeur, 0);
    return {
      code: c.code,
      libelle: c.libelle,
      totalAttendu: c.totalAttendu,
      sommeCalculee: somme,
      nbLots: lignes.length,
      ecart: somme - c.totalAttendu,
    };
  });

  // Les LOTS comme element distinctif : deux homonymes aux lots disjoints sont deux personnes
  // (cas des deux GOUGE Isabelle de S0306). Sans cette carte, detecterDoublons proposerait la
  // fusion de deux owners pourtant distincts.
  const lotsParOwnerDedup = new Map<string, Set<number>>();
  for (const a of jeu.attributions) {
    const s = lotsParOwnerDedup.get(a.ownerId) ?? new Set<number>();
    s.add(a.lot);
    lotsParOwnerDedup.set(a.ownerId, s);
  }
  const groupes = detecterDoublons(jeu.owners, lotsParOwnerDedup);
  const checks = verifierTout(jeu);

  // Bloc liaison (owners <-> comptes 450) : present seulement si le jeu porte des liaisons
  // (analyse unifiee avec grand livre). Derivable du jeu seul -> recalcule a la rehydratation.
  const liaison: RecapLiaison | undefined = jeu.liaisons450
    ? {
        total: jeu.liaisons450.length,
        lies: jeu.liaisons450.filter((l) => l.statut === "lie").length,
        aTrancher: jeu.liaisons450.filter((l) => l.statut === "ambigu").length,
        sansCompte: jeu.liaisons450.filter((l) => l.statut === "non_trouve").length,
      }
    : undefined;

  return {
    lots: { total: jeu.lots.length, parUsage },
    cles,
    owners: {
      total: jeu.owners.length,
      sci: jeu.owners.filter((o) => o.pro).length,
      couples: jeu.owners.filter((o) => o.civilite === "m&mme" || o.civilite === "m|mme").length,
    },
    attributions: {
      total: jeu.attributions.length,
      lotsOrphelins: jeu.lots.filter((l) => !lotsAttribues.has(l.numero)).length,
    },
    fusionsProposees: groupes.filter((g) => g.type === "fusion_proposee").length,
    doublonsNonTranchables: groupes.filter((g) => g.type === "doublon_non_tranchable").length,
    notes: [],
    checks,
    pretAProduire: checks.ok,
    ...(liaison ? { liaison } : {}),
  };
}

/**
 * ETAPE 1 + 2 du volet patrimoine : PARSE les xlsx verses puis calcule le recap GO/STOP.
 * NE PRODUIT PAS les fichiers, N'INJECTE RIEN. Deterministe (zero IA, zero reseau).
 *
 * Les erreurs de PARSING (structure des fichiers) sont remontees a part ET en tete des notes
 * (visibles dans le recap) ; les erreurs METIER (auto-checks) vivent dans recap.checks. Un
 * parsing en erreur laisse quand meme passer ce qui a pu etre lu : le gestionnaire voit ce
 * qui manque au lieu d'un ecran vide - mais pretAProduire est verrouille a false.
 */
export async function analyserPatrimoineDepuisXlsx(fichiers: DocumentSource[]): Promise<AnalysePatrimoine> {
  const parse = await parserJeuDepuisXlsx(fichiers.map((f) => ({ nom: f.nom, contenu: f.contenu })));
  const recap = calculerRecap(parse.jeu);
  recap.notes = [...parse.erreurs.map((e) => `Fichier verse : ${e}`), ...parse.notes];
  // Un parsing en erreur bloque la production/injection meme si les checks metier passent
  // (un links illisible peut laisser un jeu partiellement coherent : le verrou est ici).
  if (!parse.ok) recap.pretAProduire = false;
  return { jeu: parse.jeu, recap, erreursParsing: parse.erreurs };
}

/**
 * ETAPE 3 : production des .xlsx (phase A, repli pour import manuel dans l'UI eStale).
 * A n'appeler qu'apres GO humain. Re-verifie les auto-checks et refuse de produire si une
 * erreur bloquante subsiste.
 */
function refuserSiErreurs(jeu: JeuDeDonnees): void {
  const checks = verifierTout(jeu);
  if (!checks.ok) {
    throw new Error(
      `Production refusee : ${checks.erreurs.length} erreur(s) bloquante(s) -> ${checks.erreurs
        .map((e) => e.code)
        .join(", ")}`,
    );
  }
}

export async function produirePhaseA(jeu: JeuDeDonnees, opts: OptionsGeneration): Promise<FichierGenere[]> {
  refuserSiErreurs(jeu);
  return genererPhaseA(jeu, opts);
}

/** Idem en buffers memoire (pour servir le telechargement cote UI). */
export async function produirePhaseABuffers(jeu: JeuDeDonnees): Promise<FichierBuffer[]> {
  refuserSiErreurs(jeu);
  return genererPhaseABuffers(jeu);
}
