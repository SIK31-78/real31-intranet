// Orchestrateur de la reprise PATRIMOINE (les "3 sous-agents") :
//   1. extraction : Agent 1 (patrimoine) ET Agent 2 (proprietaires) en PARALLELE ;
//   2. assemblage du JeuDeDonnees + auto-checks deterministes (Agent 3) ;
//   3. mini-recap GO/STOP (R3) -> l'humain valide AVANT generation des .xlsx.
//
// La generation des fichiers est une etape SEPAREE (produirePhaseA), volontairement
// non lancee par analyserPatrimoine : on ne produit jamais les xlsx sans GO explicite.

import type { JeuDeDonnees, Usage } from "@/lib/reprise/domain/patrimoine";
import { USAGES } from "@/lib/reprise/domain/patrimoine";
import { verifierTout, type ResultatChecks } from "@/lib/reprise/domain/auto-checks";
import { detecterDoublons } from "@/lib/reprise/domain/dedup";
import type { DocumentSource, ExtractionProvider } from "@/lib/reprise/ports/extraction-provider";
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
}

/** Mini-recap presente a l'humain pour decision GO/STOP (cf. ETAPE 2 du protocole). */
export interface RecapPatrimoine {
  lots: { total: number; parUsage: Record<Usage, number> };
  cles: RecapCle[];
  owners: { total: number; sci: number; couples: number };
  attributions: { total: number; lotsOrphelins: number };
  fusionsProposees: number;
  doublonsNonTranchables: number;
  /** Notes de vigilance remontees par l'extraction (Agent 1 + Agent 2). */
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
   * Resume de la reprise comptable. Renseigne par l'analyse unifiee (route), PAS par
   * calculerRecap (le grand livre ne vit pas dans le jeu patrimoine). Absent sans grand livre.
   */
  compta?: RecapCompta;
}

export interface AnalysePatrimoine {
  jeu: JeuDeDonnees;
  recap: RecapPatrimoine;
}

/**
 * Derive le mini-recap GO/STOP depuis un jeu de donnees (compteurs, ecarts par cle,
 * auto-checks). `notes` reste vide : c'est a l'appelant de les re-injecter s'il les a
 * (l'extraction les fournit ; une rehydratation depuis le jeu persiste ne les a plus).
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

  const groupes = detecterDoublons(jeu.owners);
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
 * ETAPE 1 + 2 : extraction parallele puis recap GO/STOP. NE PRODUIT PAS les .xlsx.
 */
// Aiguillage des documents par nom de fichier vers le bon agent : reduit le nombre de pages
// par requete (Claude limite a 100 pages/requete) ET cible chaque agent. Agent 1 (structure)
// = RCP / EDD / modificatifs ; Agent 2 (owners) = feuille de presence / PV. Un document non
// reconnu (ex. fiche synthese) part aux DEUX (securite). Si un filtre est vide -> tous les docs.
function pourStructure(nom: string): boolean {
  return /rcp|edd|rgdd|reglement|règlement|modificatif|descriptif|division|repartition|répartition|annexe|comptable|budget|convocation/i.test(nom);
}
function pourProprietaires(nom: string): boolean {
  return /presence|présence|\bpv\b|proces|procès|assemblee|assemblée|feuille/i.test(nom);
}

export async function analyserPatrimoine(
  provider: ExtractionProvider,
  docs: DocumentSource[],
): Promise<AnalysePatrimoine> {
  const docsStructure = docs.filter((d) => pourStructure(d.nom) || !pourProprietaires(d.nom));
  const docsProprietaires = docs.filter((d) => pourProprietaires(d.nom) || !pourStructure(d.nom));
  const [patrimoine, proprietaires] = await Promise.all([
    provider.extrairePatrimoine(docsStructure.length ? docsStructure : docs),
    provider.extraireProprietaires(docsProprietaires.length ? docsProprietaires : docs),
  ]);

  const jeu: JeuDeDonnees = {
    lots: patrimoine.lots,
    cles: patrimoine.cles,
    tantiemes: patrimoine.tantiemes,
    owners: proprietaires.owners,
    attributions: proprietaires.attributions,
  };

  const recap = calculerRecap(jeu);
  recap.notes = [...patrimoine.notes, ...proprietaires.notes];
  return { jeu, recap };
}

/**
 * ETAPE 3 : production des .xlsx (phase A). A n'appeler qu'apres GO humain.
 * Re-verifie les auto-checks et refuse de produire si une erreur bloquante subsiste.
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
