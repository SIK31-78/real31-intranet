// ASSEMBLAGE MULTI-SYNDICS d'un MEME exercice - domaine PUR, aucune I/O.
//
// Cas reel (S0304, Partie 12 du skill estale-migration) : l'exercice 2024-2025 est a cheval
// sur deux syndics - le predecesseur (01/07/2024 -> 20/02/2025) puis le sortant (25/02 ->
// 30/06/2025). Le sortant n'a PAS repris l'historique de son predecesseur : il a pose des
// SOLDES d'ouverture a sa date d'entree, qui RESUMENT une periode dont on possede le detail.
//
// ⚠ Importer les deux grands livres bout a bout compte alors DEUX FOIS la periode resumee
// (mesure sur S0304 : 93 067,20 de travaux et 141 352,50 d'appels comptes deux fois).
//
// LA REGLE : quand le detail du predecesseur est fourni, les reports d'ouverture du
// successeur sont OMIS pour la periode couverte - les soldes de bilan se reconstituent
// d'eux-memes. Chaque omission est TRACEE dans le rapport (jamais silencieuse), et les
// totaux imprimes du successeur sont AJUSTES du report omis pour que le filet "report +
// ecritures == total imprime" reste juste.
//
// LE RACCORD PAR CLASSE : les plans comptables des deux syndics different (le raccord
// compte a compte n'a pas de sens) - on confronte, PAR CLASSE 1..7, le solde de fin de
// mandat du predecesseur aux reports d'ouverture du successeur. Les ecarts sont PORTEURS DE
// SENS, pas forcement d'erreur (classe 5 du predecesseur reprise en classe 4 d'attente,
// classes 6/7 partiellement reprises) ; les ecarts residuels sont des rompus, a tracer.

import { classeDe, type ClasseComptable } from "@/lib/reprise/domain/compta";
import type { ControleCompte, JeuEcritures } from "@/lib/reprise/domain/ecriture";
import { plageDatesEcritures } from "@/lib/reprise/domain/ecriture";

/** Une source de grand livre, dans l'ordre CHRONOLOGIQUE du mandat (predecesseur d'abord). */
export interface SourceGlAssemblage {
  /** Libelle PII-free de la source (ex. "GL predecesseur 07/2024 -> 02/2025"). */
  label: string;
  jeu: JeuEcritures;
}

/** Confrontation d'UNE classe a une jonction entre deux syndics. */
export interface RaccordClasse {
  classe: ClasseComptable;
  /** Solde signe cumule (reports gardes + ecritures) des sources AVANT la jonction. */
  soldePredecesseur: number;
  /** Reports d'ouverture signes du successeur (ce qu'il dit avoir recu). */
  reportsSuccesseur: number;
  /** Ecart signe = reportsSuccesseur - soldePredecesseur (rompus / bascule de classe). */
  ecart: number;
}

/** Le raccord complet d'une jonction predecesseur -> successeur. */
export interface RaccordJonction {
  de: string;
  vers: string;
  parClasse: RaccordClasse[];
  /** Somme des ecarts signes (0 attendu : les deux cotes sont des balances completes). */
  ecartTotal: number;
}

/** Un report d'ouverture OMIS (trace, jamais silencieux). */
export interface ReportOmis {
  source: string;
  compte: string;
  /** Montant signe (debit positif) du report omis. */
  montantSigne: number;
}

/** Le rapport EXPLICITE de l'assemblage : ce qui a ete omis, et ce que dit le raccord. */
export interface RapportAssemblage {
  sources: { label: string; nbEcritures: number; plageMin?: string; plageMax?: string }[];
  /** Les reports d'ouverture des successeurs, omis compte par compte. */
  reportsOmis: ReportOmis[];
  totalOmisDebit: number;
  totalOmisCredit: number;
  /** Une jonction par paire de sources consecutives. */
  jonctions: RaccordJonction[];
  notes: string[];
}

const CLASSES: ClasseComptable[] = [1, 2, 3, 4, 5, 6, 7];

function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Classe comptable tolerante (null si hors 1..7) - les comptes du sortant sont deja passes
 *  par le normaliseur, mais un controle peut porter un compte sans ecriture. */
function classeSafe(compte: string): ClasseComptable | null {
  try {
    return classeDe(compte);
  } catch {
    return null;
  }
}

/** Solde signe cumule PAR CLASSE d'un jeu : reports des controles + ecritures. */
function soldesParClasse(jeux: JeuEcritures[]): Record<ClasseComptable, number> {
  const out = {} as Record<ClasseComptable, number>;
  for (const c of CLASSES) out[c] = 0;
  for (const jeu of jeux) {
    for (const ctrl of jeu.controles ?? []) {
      const cl = classeSafe(ctrl.compte);
      if (cl === null) continue;
      out[cl] += (ctrl.reportDebit ?? 0) - (ctrl.reportCredit ?? 0);
    }
    for (const l of jeu.lignes) {
      out[l.classe] += l.sens === "debit" ? l.montant : -l.montant;
    }
  }
  for (const c of CLASSES) out[c] = arrondi(out[c]);
  return out;
}

/** Reports d'ouverture signes PAR CLASSE d'un jeu (ce que le successeur dit avoir recu). */
function reportsParClasse(jeu: JeuEcritures): Record<ClasseComptable, number> {
  const out = {} as Record<ClasseComptable, number>;
  for (const c of CLASSES) out[c] = 0;
  for (const ctrl of jeu.controles ?? []) {
    const cl = classeSafe(ctrl.compte);
    if (cl === null) continue;
    out[cl] += (ctrl.reportDebit ?? 0) - (ctrl.reportCredit ?? 0);
  }
  for (const c of CLASSES) out[c] = arrondi(out[c]);
  return out;
}

/**
 * Assemble PLUSIEURS grands livres ordonnes (predecesseur -> ... -> sortant) en UN seul jeu
 * d'ecritures couvrant l'exercice complet :
 *   - toutes les ecritures de toutes les sources sont conservees, dans l'ordre des sources ;
 *   - les reports d'ouverture de la PREMIERE source sont GARDES (c'est l'ouverture reelle de
 *     l'exercice) ; ceux de chaque SUCCESSEUR sont OMIS (ils resument la periode dont on
 *     reprend le detail) et traces dans le rapport ;
 *   - les totaux imprimes des successeurs sont AJUSTES du report omis (le filet "report +
 *     ecritures == total imprime" reste alors exact) ;
 *   - chaque jonction est confrontee PAR CLASSE (solde de fin de mandat du predecesseur vs
 *     reports du successeur) - les ecarts sont rendus, jamais juges ici : c'est un rapport.
 *
 * Une SEULE source = passage a l'identite (rapport trivial). Zero source = erreur.
 * PUR : meme entree => meme sortie. Les jeux d'entree ne sont pas modifies.
 */
export function assemblerExerciceMultiSyndics(sources: SourceGlAssemblage[]): {
  jeu: JeuEcritures;
  rapport: RapportAssemblage;
} {
  if (sources.length === 0) {
    throw new Error("Assemblage multi-syndics : aucune source fournie (au moins un grand livre attendu).");
  }

  const notes: string[] = [];
  const reportsOmis: ReportOmis[] = [];
  const jonctions: RaccordJonction[] = [];
  let totalOmisDebit = 0;
  let totalOmisCredit = 0;

  // --- Controles assembles : source 0 telle quelle, successeurs sans reports (ajustes).
  const controlesParCompte = new Map<string, { controle: ControleCompte; source: string }>();
  const comptesEnCollision = new Set<string>();

  const lignes = sources.flatMap((s) => s.jeu.lignes);
  const intitules: Record<string, string> = {};
  const notesSources: string[] = [];
  let nonReconnues = 0;

  sources.forEach((source, i) => {
    const jeu = source.jeu;
    notesSources.push(...jeu.notes);
    nonReconnues += jeu.nonReconnues ?? 0;
    for (const [compte, intitule] of Object.entries(jeu.intitules ?? {})) {
      if (!(compte in intitules)) intitules[compte] = intitule;
    }

    for (const ctrl of jeu.controles ?? []) {
      let assemble: ControleCompte;
      if (i === 0) {
        assemble = { ...ctrl };
      } else {
        // Successeur : le report d'ouverture RESUME la periode du predecesseur -> OMIS
        // (trace), et le total imprime est ajuste du report pour rester reconciliable.
        const rd = ctrl.reportDebit ?? 0;
        const rc = ctrl.reportCredit ?? 0;
        if (rd !== 0 || rc !== 0) {
          reportsOmis.push({ source: source.label, compte: ctrl.compte, montantSigne: arrondi(rd - rc) });
          totalOmisDebit = arrondi(totalOmisDebit + rd);
          totalOmisCredit = arrondi(totalOmisCredit + rc);
        }
        assemble = { compte: ctrl.compte };
        if (ctrl.totalDebit !== undefined) assemble.totalDebit = arrondi(ctrl.totalDebit - rd);
        if (ctrl.totalCredit !== undefined) assemble.totalCredit = arrondi(ctrl.totalCredit - rc);
      }

      const existant = controlesParCompte.get(ctrl.compte);
      if (existant) {
        // Meme numero de compte dans DEUX sources (plans comptables qui se recouvrent) : les
        // totaux imprimes ne sont plus reconciliables ligne a ligne -> on les retire pour ce
        // compte (jamais un controle faux), on garde le report du plus ancien, et on trace.
        comptesEnCollision.add(ctrl.compte);
        const fusion: ControleCompte = { compte: ctrl.compte };
        if (existant.controle.reportDebit !== undefined) fusion.reportDebit = existant.controle.reportDebit;
        if (existant.controle.reportCredit !== undefined) fusion.reportCredit = existant.controle.reportCredit;
        controlesParCompte.set(ctrl.compte, { controle: fusion, source: existant.source });
      } else {
        controlesParCompte.set(ctrl.compte, { controle: assemble, source: source.label });
      }
    }

    // --- Raccord de la jonction (i-1) -> i, par classe.
    if (i > 0) {
      const cumulAvant = soldesParClasse(sources.slice(0, i).map((s) => s.jeu));
      const reportsApres = reportsParClasse(jeu);
      const parClasse: RaccordClasse[] = CLASSES.map((classe) => ({
        classe,
        soldePredecesseur: cumulAvant[classe],
        reportsSuccesseur: reportsApres[classe],
        ecart: arrondi(reportsApres[classe] - cumulAvant[classe]),
      }));
      jonctions.push({
        de: sources[i - 1]!.label,
        vers: source.label,
        parClasse,
        ecartTotal: arrondi(parClasse.reduce((s, r) => s + r.ecart, 0)),
      });
    }
  });

  if (comptesEnCollision.size > 0) {
    notes.push(
      `Assemblage : ${comptesEnCollision.size} compte(s) present(s) dans plusieurs sources - totaux imprimes retires pour ces comptes (non reconciliables), reports du plus ancien conserves.`,
    );
  }
  if (sources.length > 1) {
    notes.push(
      `Assemblage multi-syndics : ${sources.length} sources, ${reportsOmis.length} report(s) d'ouverture de successeur OMIS (${totalOmisDebit.toFixed(2)} debit / ${totalOmisCredit.toFixed(2)} credit) - ils resument une periode reprise en detail.`,
    );
    // Des reports omis DESEQUILIBRES sont un signal fort (mesure sur S0304, net 104 706,95) :
    // le successeur a alors aussi RESUME la periode en ECRITURES posees contre ses reports
    // (ex. Matera : lignes datees du jour de reprise, libellees "Depense avant le JJ/MM").
    // L'equilibre global de l'assemblage portera cet ecart tant que ces ecritures de resume
    // n'ont pas ete traitees - a diagnostiquer AVANT toute production, jamais a masquer.
    const netOmis = arrondi(totalOmisDebit - totalOmisCredit);
    if (Math.abs(netOmis) >= 0.005) {
      notes.push(
        `Assemblage : les reports omis ne s'equilibrent pas (net ${netOmis.toFixed(2)}) - le successeur a probablement aussi resume la periode couverte en ECRITURES (lignes datees de sa reprise, type "Depense avant le..."). L'equilibre de l'assemblage porte cet ecart : le traiter avant production.`,
      );
    }
    for (const j of jonctions) {
      const ecarts = j.parClasse.filter((r) => Math.abs(r.ecart) >= 0.005);
      notes.push(
        `Raccord ${j.de} -> ${j.vers} : ${ecarts.length} classe(s) en ecart` +
          (ecarts.length
            ? ` (${ecarts.map((r) => `classe ${r.classe}: ${r.ecart.toFixed(2)}`).join(", ")}) - bascules de classe (tresorerie en attente) et rompus, a lire avec le rapport.`
            : " : les deux comptabilites se raccordent au centime sur chaque classe."),
      );
    }
  }

  const rapport: RapportAssemblage = {
    sources: sources.map((s) => {
      const plage = plageDatesEcritures(s.jeu.lignes);
      return {
        label: s.label,
        nbEcritures: s.jeu.lignes.length,
        ...(plage.min !== undefined ? { plageMin: plage.min } : {}),
        ...(plage.max !== undefined ? { plageMax: plage.max } : {}),
      };
    }),
    reportsOmis,
    totalOmisDebit,
    totalOmisCredit,
    jonctions,
    notes,
  };

  const jeu: JeuEcritures = {
    lignes,
    notes: [...notesSources, ...notes],
    nonReconnues,
    controles: [...controlesParCompte.values()].map((v) => v.controle),
    ...(Object.keys(intitules).length > 0 ? { intitules } : {}),
  };

  return { jeu, rapport };
}
