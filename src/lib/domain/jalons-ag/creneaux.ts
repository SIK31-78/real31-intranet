// Creneaux Outlook DERIVES d'une date d'AG (demande Sekou 2026-07-17) : quand on fixe
// une date d'AG, deux blocs de travail doivent apparaitre dans le planning du
// gestionnaire. Ce ne sont PAS de nouvelles echeances : ce sont les jalons existants
// CONVOC et RELANCE_POUVOIRS, poses comme creneaux dans l'agenda.
//
//   MISE_SOUS_PLI    "{code} - Mise sous pli"     jalon CONVOC (J-31)            10h-12h
//   RELANCE_DATE_AG  "{code} - RELANCE DATE AG"   jalon RELANCE_POUVOIRS (J-7)   10h-10h30
//
// Pur, deterministe : les dates viennent de calculerJalons (jamais recalculees a la
// main), l'heure est composee dessus. Les cibles sont reculees au jour ouvre precedent
// (idempotent pour CONVOC, deja reculee par le calculateur) : un creneau de travail
// n'a aucun sens un samedi ou un 14 juillet.
//
// Ce ne sont pas des reunions : aucune salle, aucun vehicule, aucun controle de
// disponibilite (decision Sekou : un dejeuner a J-31 ne doit pas empecher de fixer
// l'AG - on pose, il deplacera).

import { calculerJalons, reculerJourOuvre } from "./calculator";
import type { JalonCode } from "./types";

/** Role d'un creneau derive : identifie la projection Outlook, INDEPENDAMMENT de la
 *  date d'AG (cf. la cle (copro_code, role) de intranet_projections_outlook : deplacer
 *  l'AG doit DEPLACER le meme evenement, pas en creer un second). */
export type RoleCreneauAg = "MISE_SOUS_PLI" | "RELANCE_DATE_AG";

interface DefinitionCreneau {
  role: RoleCreneauAg;
  /** Jalon dont la cible porte le creneau (source unique des dates). */
  jalon: Extract<JalonCode, "CONVOC" | "RELANCE_POUVOIRS">;
  /** Suffixe du sujet Outlook, ecrit tel que Sekou l'a demande (tiret, capitales). */
  suffixe: string;
  heureDebut: string;
  heureFin: string;
}

/** Les deux creneaux, dans l'ordre chronologique (mise sous pli puis relance). */
export const CRENEAUX_AG: readonly DefinitionCreneau[] = [
  {
    role: "MISE_SOUS_PLI",
    jalon: "CONVOC",
    suffixe: "Mise sous pli",
    heureDebut: "10:00",
    heureFin: "12:00",
  },
  {
    role: "RELANCE_DATE_AG",
    jalon: "RELANCE_POUVOIRS",
    suffixe: "RELANCE DATE AG",
    heureDebut: "10:00",
    heureFin: "10:30",
  },
] as const;

export interface CreneauAg {
  role: RoleCreneauAg;
  /** Sujet Outlook, ex. "S024 - Mise sous pli". */
  sujet: string;
  /** Debut local 'YYYY-MM-DDTHH:mm:00'. */
  debut: string;
  /** Fin local 'YYYY-MM-DDTHH:mm:00'. */
  fin: string;
}

/** Sujet Outlook d'un creneau. Notation de Sekou : tiret (et non le deux-points des
 *  projections AG/CS "S024 : AG à confirmer"), "RELANCE DATE AG" en capitales. */
export function sujetCreneauAg(coproCode: string, role: RoleCreneauAg): string {
  const def = CRENEAUX_AG.find((c) => c.role === role);
  return `${coproCode} - ${def?.suffixe ?? role}`;
}

/**
 * Les deux creneaux a poser dans l'agenda pour l'AG du `agDebut` de la copro.
 * `agDebut` : 'YYYY-MM-DD' ou 'YYYY-MM-DDTHH:mm:00' (l'heure de l'AG n'entre pas
 * dans le calcul, seul le jour compte). Deplacer l'AG => ces cibles se recalculent
 * (decalage jour ouvre compris).
 */
export function creneauxAg(coproCode: string, agDebut: string): CreneauAg[] {
  const jalons = calculerJalons(agDebut.slice(0, 10));
  return CRENEAUX_AG.flatMap((def) => {
    const cible = jalons.find((j) => j.code === def.jalon)?.cibleDate;
    if (!cible) return [];
    // Idempotent sur CONVOC (le calculateur l'a deja reculee) ; utile sur
    // RELANCE_POUVOIRS, dont le jalon reste a J-7 exact.
    const jour = reculerJourOuvre(cible);
    return [
      {
        role: def.role,
        sujet: sujetCreneauAg(coproCode, def.role),
        debut: `${jour}T${def.heureDebut}:00`,
        fin: `${jour}T${def.heureFin}:00`,
      },
    ];
  });
}
