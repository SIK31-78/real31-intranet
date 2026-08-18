// Service : PREREQUIS D'ETAT avant tout import comptable eStale (increment 3).
//
// Sonde SE999 (2026-08-18) : eStale REFUSE une ecriture datee hors de tout exercice, refuse
// TOUT sur un exercice verrouille, et son erreur est la meme dans tous les cas ("Oupss",
// opaque). Decouvrir ca en plein milieu de 300 mutations laisserait un import a moitie fait.
// Ce service verifie donc l'ETAT AVANT la premiere ecriture :
//   - chaque date du jeu tombe dans un exercice eStale EXISTANT (aucune mutation n'en cree
//     un : c'est un prerequis de CREATION de la copro - poser le debut de compta au debut
//     de l'historique a reprendre) ;
//   - aucun de ces exercices n'est verrouille (lockedAt) ni clos (closedAt).
//
// LECTURE SEULE (le port d'ecriture n'est jamais touche ici). Passe par le routeur (ADR-001).
// Degrade proprement : copro introuvable / eStale indisponible => { ok:false, message }.

import type { JeuEcritures } from "@/lib/reprise/domain/ecriture";
import { verifierExercicesPourDates, type VerdictExercices } from "@/lib/reprise/domain/compta";
import type { EstaleComptaLectureProvider } from "@/lib/reprise/ports/estale-compta-lecture-provider";
import { getEstaleComptaLectureProvider } from "@/lib/reprise/adapters/router";

export type ResultatPrerequisImport =
  | { ok: true; verdict: VerdictExercices; condoID: string }
  | { ok: false; message: string };

/**
 * Verifie les prerequis d'etat eStale pour importer ce jeu d'ecritures dans la copro.
 * `verdict.ok` false => l'import doit etre REFUSE, les motifs disent quoi corriger
 * (deverrouiller, rouvrir, ou constater que l'historique n'a pas d'exercice - auquel cas
 * la reprise de cette periode est impossible par l'API).
 */
export async function verifierPrerequisImport(
  jeu: JeuEcritures,
  coproCode: string,
  provider: EstaleComptaLectureProvider = getEstaleComptaLectureProvider(),
): Promise<ResultatPrerequisImport> {
  try {
    const ref = await provider.resoudreAccounting(coproCode);
    if (!ref) {
      return {
        ok: false,
        message: `Copro "${coproCode}" introuvable dans eStale ou sans exercice comptable ouvert.`,
      };
    }
    const exercices = await provider.lireExercices(ref.condoID);
    const verdict = verifierExercicesPourDates(
      exercices,
      jeu.lignes.map((l) => l.date),
    );
    return { ok: true, verdict, condoID: ref.condoID };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Prerequis d'import non verifiables pour "${coproCode}" : ${message}` };
  }
}
