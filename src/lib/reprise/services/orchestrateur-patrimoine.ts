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
}

export interface AnalysePatrimoine {
  jeu: JeuDeDonnees;
  recap: RecapPatrimoine;
}

function recapPourcentages(jeu: JeuDeDonnees): RecapPatrimoine {
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
  };
}

/**
 * ETAPE 1 + 2 : extraction parallele puis recap GO/STOP. NE PRODUIT PAS les .xlsx.
 */
export async function analyserPatrimoine(
  provider: ExtractionProvider,
  docs: DocumentSource[],
): Promise<AnalysePatrimoine> {
  const [patrimoine, proprietaires] = await Promise.all([
    provider.extrairePatrimoine(docs),
    provider.extraireProprietaires(docs),
  ]);

  const jeu: JeuDeDonnees = {
    lots: patrimoine.lots,
    cles: patrimoine.cles,
    tantiemes: patrimoine.tantiemes,
    owners: proprietaires.owners,
    attributions: proprietaires.attributions,
  };

  const recap = recapPourcentages(jeu);
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
