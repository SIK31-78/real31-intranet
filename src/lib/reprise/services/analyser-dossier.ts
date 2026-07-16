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

import { estNomGrandLivre as estGrandLivre } from "@/lib/reprise/domain/limites-upload";
import type { DocumentSource, ExtractionProvider } from "@/lib/reprise/ports/extraction-provider";
import type { ExtractionComptaProvider } from "@/lib/reprise/ports/extraction-compta-provider";
import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";
import { comptes450DeIntitules, lierOwnersComptes } from "@/lib/reprise/domain/liaison-comptes";
import {
  classerParExercice,
  detecterAvantRepartition,
  messageRaccordement,
  raccorderExercices,
  type VerdictRaccordement,
} from "@/lib/reprise/domain/controle-comptes";
import {
  analyserPatrimoine,
  calculerRecap,
  type RecapCompta,
  type RecapPatrimoine,
} from "@/lib/reprise/services/orchestrateur-patrimoine";
import {
  extraireEtVerifierGrandLivre,
  type ResultatRepriseCompta,
} from "@/lib/reprise/services/reprendre-compta";

export interface AnalyseDossier {
  /** Jeu patrimoine, enrichi de `liaisons450` si un grand livre a ete fourni. */
  jeu: JeuDeDonnees;
  /** Mini-recap GO/STOP, enrichi des blocs `liaison` + `compta` si grand livre. */
  recap: RecapPatrimoine;
  /** Resume compta a persister (present seulement si grand livre fourni). */
  compta?: RecapCompta;
}

/**
 * Un document est-il un GRAND LIVRE ? Aiguillage par nom de fichier (conservateur).
 * La logique vit desormais dans le domaine (limites-upload.ts) pour que les composants client
 * puissent pre-verifier les plafonds d'upload ; re-exportee ici pour les appelants existants.
 */
export { estGrandLivre };

/** Resultat de l'analyse des GRANDS LIVRES : exercice cloture, exercice en cours, controle croise. */
interface AnalyseGrandsLivres {
  /** Exercice CLOTURE (base : liaison + garde-fou avant-repartition + resume compta principal). */
  cloture: ResultatRepriseCompta | null;
  /** Exercice EN COURS (second grand livre classe), si fourni et exploite. */
  enCours: ResultatRepriseCompta | null;
  /** Controle croise cloture <-> en cours (present si les deux GL exploites ET reports captures). */
  raccordement?: VerdictRaccordement;
  /** Erreur d'extraction du GL cloture (compta globalement non exploitee) -> recap.comptaErreur. */
  erreur?: string;
  /** Notes de vigilance PII-free (en cours attendu / KO, chevauchement, reports absents...). */
  notes: string[];
}

/** Extrait UN grand livre isole (try/catch : la couche texte leve sur un scan). PII-free. */
async function extraireUn(
  provider: ExtractionComptaProvider,
  doc: DocumentSource,
): Promise<{ ok: true; res: ResultatRepriseCompta } | { ok: false; erreur: string }> {
  return extraireEtVerifierGrandLivre(provider, [doc]).then(
    (res) => ({ ok: true as const, res }),
    (e: unknown) => ({
      ok: false as const,
      erreur: e instanceof Error ? e.message : "Extraction du grand livre impossible.",
    }),
  );
}

/**
 * Classe et controle les grands livres d'une reprise. AIGUILLAGE ROBUSTE par le CONTENU (dates des
 * ecritures), pas par le nom de fichier :
 *   - 0 ou 1 GL, ou plus de 2 : pipeline mono (comportement d'avant) -> un seul exercice CLOTURE ;
 *     un seul GL laisse une VIGILANCE "en cours attendu" (le controle croise ne peut pas etre fait).
 *   - exactement 2 GL : extraction SEPAREE de chacun, classement par plage de dates (le plus ancien
 *     = cloture, le plus recent = en cours), verification de chevauchement, puis CONTROLE CROISE
 *     (raccorderExercices). Un seul des deux exploitable -> il sert de cloture, l'autre est note KO.
 * Ne leve jamais : toute erreur d'extraction est capturee et remontee via `erreur`/`notes`.
 */
async function analyserGrandsLivres(
  provider: ExtractionComptaProvider,
  glDocs: DocumentSource[],
): Promise<AnalyseGrandsLivres> {
  // Cas mono-pipeline : 0/1 GL (retro-compat stricte) ou >2 (classement auto non applique).
  if (glDocs.length !== 2) {
    const r = await extraireEtVerifierGrandLivre(provider, glDocs).then(
      (res) => ({ ok: true as const, res }),
      (e: unknown) => ({
        ok: false as const,
        erreur: e instanceof Error ? e.message : "Extraction du grand livre impossible.",
      }),
    );
    if (!r.ok) return { cloture: null, enCours: null, erreur: r.erreur, notes: [] };
    const notes: string[] = [];
    if (glDocs.length === 1) {
      notes.push(
        "Grand livre de l'exercice EN COURS a fournir : un seul grand livre recu, le controle croise cloture <-> en cours n'a pas pu etre fait (a verifier).",
      );
    } else if (glDocs.length > 2) {
      notes.push(
        `${glDocs.length} grands livres fournis : classement automatique cloture/en cours limite a 2 documents, a verifier manuellement.`,
      );
    }
    return { cloture: r.res, enCours: null, notes };
  }

  // Exactement 2 grands livres : extraction SEPAREE puis classement par exercice.
  const [a, b] = await Promise.all([extraireUn(provider, glDocs[0]), extraireUn(provider, glDocs[1])]);

  // Les deux echouent -> compta non exploitee (remonte la 1re erreur, comme le pipeline mono).
  if (!a.ok && !b.ok) return { cloture: null, enCours: null, erreur: a.erreur, notes: [] };
  // Un seul exploitable -> il sert d'exercice CLOTURE (base), l'autre est note KO (pas de croise).
  if (!a.ok || !b.ok) {
    const okRes = a.ok ? a.res : (b as { ok: true; res: ResultatRepriseCompta }).res;
    const erreurAutre = a.ok ? (b as { ok: false; erreur: string }).erreur : a.erreur;
    return {
      cloture: okRes,
      enCours: null,
      notes: [
        `Un des deux grands livres n'a pas pu etre extrait (${erreurAutre}) : controle croise cloture <-> en cours impossible (a verifier).`,
      ],
    };
  }

  // Deux GL exploitables : classement par plage de dates (le plus ancien = cloture).
  const notes: string[] = [];
  const classe = classerParExercice({ lignes: a.res.jeu.lignes, res: a.res }, { lignes: b.res.jeu.lignes, res: b.res });
  const cloture = classe.cloture.res;
  const enCours = classe.enCours.res;

  if (classe.datesIndisponibles) {
    notes.push(
      "Dates des ecritures indisponibles sur les deux grands livres : classement cloture/en cours par ordre de depot (peu fiable, a verifier).",
    );
  }
  if (classe.chevauchement) {
    notes.push(
      "Chevauchement des dates entre les deux grands livres (l'exercice cloture deborde sur l'en cours) : coherence a verifier.",
    );
  }

  // CONTROLE CROISE : les a-nouveaux de l'en cours doivent egaler les soldes finaux du cloture. Si
  // l'en cours ne porte AUCUN report capture, le croise n'est pas concluant -> on ne le calcule pas
  // (eviter de bloquer a tort), on note la limitation.
  const enCoursSansReports = !(enCours.jeu.controles ?? []).some(
    (c) => (c.reportDebit ?? 0) !== 0 || (c.reportCredit ?? 0) !== 0,
  );
  if (enCoursSansReports) {
    notes.push(
      "Reports a-nouveau non captures sur le grand livre EN COURS : controle croise non concluant (extraction couche texte requise, a verifier).",
    );
    return { cloture, enCours, notes };
  }

  const raccordement = raccorderExercices(
    { lignes: cloture.jeu.lignes, controles: cloture.jeu.controles },
    { lignes: enCours.jeu.lignes, controles: enCours.jeu.controles },
  );
  return { cloture, enCours, raccordement, notes };
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
  //
  // L'extraction du grand livre est ISOLEE dans un try/catch : la couche-texte-only leve une
  // erreur explicite sur un PDF scanne. Cette erreur NE DOIT PAS faire echouer le patrimoine
  // (degradation PARTIELLE) -> on la capture et on l'expose via recap.comptaErreur.
  const [patrimoine, grandLivresRes] = await Promise.all([
    patriDocs.length > 0 ? analyserPatrimoine(extraction, patriDocs) : Promise.resolve(null),
    avecGrandLivre ? analyserGrandsLivres(extractionCompta!, glDocs) : Promise.resolve(null),
  ]);

  const grandLivre = grandLivresRes?.cloture ?? null;
  const grandLivreEnCours = grandLivresRes?.enCours ?? null;
  const raccordement = grandLivresRes?.raccordement;
  const comptaErreur = grandLivresRes?.erreur;
  const notesGrandsLivres = grandLivresRes?.notes ?? [];

  if (!patrimoine && !grandLivre) {
    // Ni patrimoine, ni grand livre exploitable. Si un grand livre etait joint mais a echoue
    // (ex. scan), on remonte SON erreur explicite ; sinon le message generique.
    throw new Error(comptaErreur ?? "Aucun document exploitable (ni patrimoine ni grand livre).");
  }

  // Pas de grand livre exploitable mais patrimoine OK : degradation PARTIELLE. On renvoie le
  // patrimoine seul, en attachant l'erreur d'extraction du grand livre au recap (le bloc compta
  // l'affichera au lieu de tout faire echouer).
  if (!grandLivre) {
    const recap = patrimoine!.recap;
    if (comptaErreur) recap.comptaErreur = comptaErreur;
    return { jeu: patrimoine!.jeu, recap };
  }

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

  // Liaison owners <-> comptes 450 (reutilise le scoring conservateur de mapping-compta). Les
  // intitules 450 sont l'UNION des deux grands livres : l'exercice en cours peut porter des
  // coproprietaires nouveaux (ventes recentes) absents de l'exercice cloture. On ne fusionne PAS les
  // ecritures (elles restent separees pour l'import Inc. 3) : seuls les intitules (nom -> compte) sont
  // unis pour l'appariement. L'en cours (plus recent) prime en cas de meme compte.
  const intitulesUnion: Record<string, string> = {
    ...(grandLivre.jeu.intitules ?? {}),
    ...(grandLivreEnCours?.jeu.intitules ?? {}),
  };
  const comptes450 = comptes450DeIntitules(intitulesUnion);
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
  recap.notes = [...notesPatrimoine, ...notesLiaison, ...notesGrandsLivres];

  // Garde-fou "grand livre AVANT repartition" (classe 6/7 avec report non nul) : alerte rouge
  // dans le recap unifie (il faut redemander le grand livre APRES repartition). PII-free.
  const avantRep = detecterAvantRepartition(grandLivre.jeu.controles ?? []);

  const compta: RecapCompta = {
    equilibre: grandLivre.equilibreGlobal.equilibre,
    ecart: grandLivre.equilibreGlobal.ecart,
    nbComptes: new Set(grandLivre.jeu.lignes.map((l) => l.compte)).size,
    nbEcritures: grandLivre.jeu.lignes.length,
    ...(avantRep.avantRepartition ? { avantRepartition: avantRep.comptes } : {}),
  };
  recap.compta = compta;

  // Exercice EN COURS (second grand livre) : resume compta + ANOMALIE si des comptes 6/7 portent un
  // report non nul (apres cloture ils repartent a zero -> report 6/7 non nul = anomalie). Meme
  // detection que l'avant-repartition, mais ici c'est une anomalie de l'en cours (pas "mauvais
  // document"). Le bloc compta l'affiche distinctement.
  if (grandLivreEnCours) {
    const reports67 = detecterAvantRepartition(grandLivreEnCours.jeu.controles ?? []);
    recap.comptaEnCours = {
      equilibre: grandLivreEnCours.equilibreGlobal.equilibre,
      ecart: grandLivreEnCours.equilibreGlobal.ecart,
      nbComptes: new Set(grandLivreEnCours.jeu.lignes.map((l) => l.compte)).size,
      nbEcritures: grandLivreEnCours.jeu.lignes.length,
      ...(reports67.avantRepartition ? { avantRepartition: reports67.comptes } : {}),
    };
  }

  // CONTROLE CROISE (le joyau) : si KO, on le remonte aussi en note (classee anomalie/erreur par le
  // systeme de notes) en plus du verdict structure (affiche en rouge par le bloc compta).
  if (raccordement) {
    recap.raccordement = raccordement;
    if (!raccordement.raccorde) recap.notes.push(messageRaccordement(raccordement));
  }

  return { jeu, recap, compta };
}
