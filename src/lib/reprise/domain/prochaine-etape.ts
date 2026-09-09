// GUIDAGE "prochaine etape" du tableau de suivi d'equipe (ADR-037).
//
// Refonte 2026-09-09 : l'ancienne cascade etait cablee sur l'import UI (jeu present ? deja injecte ?
// fiches generees ?...). Le module n'importe plus rien : la prochaine etape se derive UNIQUEMENT de
// la checklist du dossier (statuts, echeances, assignations). Fonction pure, aucune I/O, aucune
// horloge (la date du jour est fournie par l'appelant). PII-free hors le nom de l'assigne.

import type { Etape, Personne, Phase } from "@/lib/reprise/domain/dossier";
import { etapeCourante } from "@/lib/reprise/domain/dossier";

/** Tonalite d'affichage du bandeau (couleur). */
export type TonaliteEtape = "normal" | "attention" | "bloque" | "termine";

export interface ProchaineEtape {
  /** Code de l'etape mise en avant (absent quand la reprise est terminee). */
  code?: string;
  phase?: Phase;
  titre: string;
  /** Description courte (motif de blocage, assigne, echeance). */
  description: string;
  tonalite: TonaliteEtape;
  assigne?: Personne;
  note?: string;
  echeance?: string;
}

/**
 * Derive LA prochaine etape a mettre en avant (premier match gagne) :
 *   1. premiere `bloque`   -> tonalite "bloque", titre « Bloqué : … », description = motif + assigne ;
 *   2. premiere `en_cours` -> "normal", titre « En cours : … » ;
 *   3. premiere `a_faire`  -> "normal", titre « Prochaine étape : … » ; "attention" si son echeance
 *                             est depassee (echeance < aujourd'hui) ;
 *   4. aucune              -> "termine", titre « Reprise terminée ».
 * L'ordre bloque > en_cours > a_faire est celui de `etapeCourante` (domaine dossier).
 */
export function prochaineEtape(etapes: Etape[], aujourdHuiIso?: string): ProchaineEtape {
  const e = etapeCourante(etapes);
  if (!e) {
    return {
      titre: "Reprise terminée",
      description: "Toutes les étapes de la reprise sont faites ou ignorées. Le dossier peut être archivé.",
      tonalite: "termine",
    };
  }

  const commun = {
    code: e.code,
    phase: e.phase,
    ...(e.assigneA ? { assigne: e.assigneA } : {}),
    ...(e.note ? { note: e.note } : {}),
    ...(e.echeance ? { echeance: e.echeance } : {}),
  };

  if (e.statut === "bloque") {
    return {
      ...commun,
      titre: `Bloqué : ${e.libelle}`,
      description: joindre([e.note ?? "Motif non renseigné.", assigneTexte(e), echeanceTexte(e)]),
      tonalite: "bloque",
    };
  }

  if (e.statut === "en_cours") {
    return {
      ...commun,
      titre: `En cours : ${e.libelle}`,
      description: joindre([assigneTexte(e), echeanceTexte(e), e.note]) || "Étape en cours.",
      tonalite: "normal",
    };
  }

  const enRetard = !!aujourdHuiIso && !!e.echeance && e.echeance < aujourdHuiIso.slice(0, 10);
  return {
    ...commun,
    titre: `Prochaine étape : ${e.libelle}`,
    description:
      joindre([enRetard ? `Échéance dépassée (${formaterDate(e.echeance!)}).` : echeanceTexte(e), assigneTexte(e), e.note]) ||
      "Étape à faire.",
    tonalite: enRetard ? "attention" : "normal",
  };
}

function assigneTexte(e: Etape): string | undefined {
  return e.assigneA ? `Assignée à ${e.assigneA.nom}.` : undefined;
}

function echeanceTexte(e: Etape): string | undefined {
  return e.echeance ? `Échéance le ${formaterDate(e.echeance)}.` : undefined;
}

function joindre(parties: (string | undefined)[]): string {
  return parties.filter((p): p is string => !!p && p.trim().length > 0).join(" ");
}

/** AAAA-MM-JJ -> JJ/MM/AAAA (affichage francais) ; laisse tel quel si le format est inattendu. */
function formaterDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
