// Service d'analyse UNIFIEE d'un dossier de reprise : patrimoine ET comptabilite en un seul
// geste. L'insight de Sekou : integrer la compta EN MEME TEMPS que le patrimoine permet de lier
// chaque coproprietaire a son NUMERO DE COMPTE 450 de l'ancien syndic DES l'analyse -> l'attribution
// de la compta devient deterministe (le numero de compte est la cle, plus d'appariement par nom
// apres coup, les homonymes se distinguent par leur compte).
//
// Aiguillage des documents par NOM DE FICHIER : un fichier "grand livre" / "GL" / "grand_livre"
// part au pipeline compta (extraction couche texte, agnostique au format syndic) ; les autres aux
// agents patrimoine (comme aujourd'hui). Un dossier peut etre analyse AVEC ou SANS grand livre :
// sans lui, tout marche comme avant (aucune liaison, aucun bloc compta) - degradation stricte.
//
// DRY-RUN strict : AUCUNE ecriture eStale, aucune mutation. Pur au sens hexagonal : ne parle qu'aux
// ports d'extraction injectes (le routeur choisit les adapters concrets).
//
// PII : la liaison lit des noms (owners + intitules 450) mais ne renvoie QUE des ownerId, numeros
// de compte et scores dans ses warnings ; jamais de nom dans les notes/warnings.

import type { DocumentSource, ExtractionProvider } from "@/lib/reprise/ports/extraction-provider";
import type { ExtractionComptaProvider } from "@/lib/reprise/ports/extraction-compta-provider";
import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";
import { comptes450DeIntitules, lierOwnersComptes } from "@/lib/reprise/domain/liaison-comptes";
import {
  analyserPatrimoine,
  calculerRecap,
  type RecapCompta,
  type RecapPatrimoine,
} from "@/lib/reprise/services/orchestrateur-patrimoine";
import { extraireEtVerifierGrandLivre } from "@/lib/reprise/services/reprendre-compta";

export interface AnalyseDossier {
  /** Jeu patrimoine, enrichi de `liaisons450` si un grand livre a ete fourni. */
  jeu: JeuDeDonnees;
  /** Mini-recap GO/STOP, enrichi des blocs `liaison` + `compta` si grand livre. */
  recap: RecapPatrimoine;
  /** Resume compta a persister (present seulement si grand livre fourni). */
  compta?: RecapCompta;
}

/**
 * Un document est-il un GRAND LIVRE ? Aiguillage par nom de fichier (conservateur) :
 * "grand livre" / "grand_livre" / "grandlivre" ou le sigle "GL" isole. Insensible a la casse.
 */
export function estGrandLivre(nom: string): boolean {
  const n = nom.toLowerCase();
  if (/grand[\s_-]*livre/.test(n)) return true;
  // "GL" comme mot isole (gl.pdf, gl_2025.pdf, S0302-GL.pdf), pas au milieu d'un mot (ex. "angle").
  return /(^|[\s_-])gl($|[\s_.-])/.test(n);
}

/**
 * Analyse un lot de documents : aiguille grand livre vs patrimoine, lance les deux pipelines EN
 * PARALLELE, puis calcule la LIAISON owners <-> comptes 450 quand un grand livre est present.
 *
 * `extractionCompta` peut etre null : dans ce cas (ou en l'absence de grand livre), seul le
 * patrimoine est analyse (degradation stricte, comportement identique a l'existant).
 */
export async function analyserDossierUnifie(
  extraction: ExtractionProvider,
  extractionCompta: ExtractionComptaProvider | null,
  docs: DocumentSource[],
): Promise<AnalyseDossier> {
  const glDocs = docs.filter((d) => estGrandLivre(d.nom));
  const avecGrandLivre = glDocs.length > 0 && extractionCompta !== null;
  // Sans provider compta, le grand livre RESTE dans le lot patrimoine (comportement d'avant
  // l'unification) ; avec provider, il est aiguille vers le pipeline compta.
  const patriDocs = avecGrandLivre ? docs.filter((d) => !estGrandLivre(d.nom)) : docs;

  // Les agents patrimoine gardent leur propre aiguillage interne (structure vs proprietaires) ;
  // on leur passe les documents NON grand-livre. Sans grand livre, patriDocs == tous les docs
  // -> comportement identique a l'existant (degradation stricte).
  // GRAND LIVRE SEUL (constate par Sekou : 4 min au lieu de 2 s) : sans document patrimoine,
  // on N'APPELLE PAS l'extraction IA patrimoine (minutes d'IA pour zero document) - l'analyse
  // reste la compta couche texte, quasi instantanee.
  const [patrimoine, grandLivre] = await Promise.all([
    patriDocs.length > 0 ? analyserPatrimoine(extraction, patriDocs) : Promise.resolve(null),
    avecGrandLivre ? extraireEtVerifierGrandLivre(extractionCompta!, glDocs) : Promise.resolve(null),
  ]);

  if (!patrimoine && !grandLivre) {
    throw new Error("Aucun document exploitable (ni patrimoine ni grand livre).");
  }

  // Pas de grand livre : degradation stricte -> patrimoine seul, comme avant.
  if (!grandLivre) return { jeu: patrimoine!.jeu, recap: patrimoine!.recap };

  // Grand livre SEUL : jeu patrimoine vide (aucune extraction IA lancee), la compta porte tout.
  const jeuPatrimoine: JeuDeDonnees = patrimoine?.jeu ?? {
    lots: [],
    cles: [],
    tantiemes: [],
    owners: [],
    attributions: [],
  };
  const notesPatrimoine = patrimoine?.recap.notes ?? [
    "Aucun document patrimoine fourni : analyse comptable seule (patrimoine a analyser separement).",
  ];

  // Liaison owners <-> comptes 450 (reutilise le scoring conservateur de mapping-compta).
  const comptes450 = comptes450DeIntitules(grandLivre.jeu.intitules);
  const liaison = lierOwnersComptes(jeuPatrimoine.owners, comptes450);

  const jeu: JeuDeDonnees = { ...jeuPatrimoine, liaisons450: liaison.liaisons };

  // Recalcule le recap depuis le jeu ENRICHI (bloc liaison) puis re-injecte les notes
  // d'extraction (patrimoine + proprietaires) + les warnings de liaison (PII-free) + une note
  // de vigilance si les intitules 450 n'ont pas ete captures (extraction non couche-texte).
  const recap = calculerRecap(jeu);
  const notesLiaison = [...liaison.warnings];
  if (comptes450.length === 0 && jeuPatrimoine.owners.length > 0) {
    notesLiaison.push(
      "Liaison 450 impossible : intitules des comptes 450 non captures par l'extraction du grand livre (pipeline couche texte requis).",
    );
  }
  recap.notes = [...notesPatrimoine, ...notesLiaison];

  const compta: RecapCompta = {
    equilibre: grandLivre.equilibreGlobal.equilibre,
    ecart: grandLivre.equilibreGlobal.ecart,
    nbComptes: new Set(grandLivre.jeu.lignes.map((l) => l.compte)).size,
    nbEcritures: grandLivre.jeu.lignes.length,
  };
  recap.compta = compta;

  return { jeu, recap, compta };
}
