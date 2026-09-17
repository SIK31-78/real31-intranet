import { useEffect, useState } from "react";
import type { ModeReunion } from "@/lib/domain/confirmation-evenement";
import { vehicules } from "@/lib/domain/salles-reunion";

// Constantes et helpers de PRESENTATION partages par l'editeur de date et ses morceaux
// (affichage hors edition, logistique, bloc « A verifier »).

// La ZOE : seul vehicule reservable (case "Reserver la voiture ZOE"). Email pris dans
// la liste fermee du domaine (jamais code en dur ici).
export const ZOE_EMAIL = vehicules()[0]?.email ?? "";

// Modes de reunion proposes dans le selecteur (+ "" = non precise). Libelle du badge
// affiche a cote de la date hors edition.
export const MODES: { valeur: ModeReunion; label: string }[] = [
  { valeur: "visio", label: "Visio" },
  { valeur: "presentiel", label: "Présentiel" },
  { valeur: "hybride", label: "Hybride" },
];
export const MODE_LABEL: Record<ModeReunion, string> = {
  visio: "Visio",
  presentiel: "Présentiel",
  hybride: "Hybride",
};

/** "dans 6 semaines" / "dans 9 jours" : on bascule en jours sous 2 semaines, ou "6 sem."
 *  serait plus flou qu'utile a l'approche de l'echeance. */
export function echeanceLisible(joursAvant: number, semainesAvant: number): string {
  if (semainesAvant >= 2) return `dans ${semainesAvant} semaines`;
  return `dans ${joursAvant} jour${joursAvant > 1 ? "s" : ""}`;
}

/** Un collaborateur (collegue) associable a une reunion : email + nom lisible. */
export type Collaborateur = { email: string; nom: string };

/** Etat de disponibilite d'une ressource ou d'un agenda sur un creneau. */
export type Dispo = "libre" | "occupee" | "inconnu";

/** Deux listes d'emails designent-elles le MEME ensemble (ordre / casse ignores) ? */
export function memeEnsemble(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a.map((e) => e.toLowerCase()));
  return b.every((e) => sa.has(e.toLowerCase()));
}

/**
 * Valeur DEBOUNCEE (audit API 2026-07-16, P1-6) : ne se propage qu'apres `delaiMs` sans
 * changement. Les verifications de dispo (getSchedule Graph) ne partent plus a CHAQUE frappe
 * dans les champs date/heure (6-10 appels Graph en quelques secondes en reglant une heure au
 * clavier) mais une fois la saisie stabilisee. Les appels obsoletes restent neutralises par
 * la cle de creneau (le resultat n'est affiche que s'il correspond a la saisie COURANTE) +
 * le flag `annule` du cleanup de chaque effet.
 */
export function useValeurDebouncee<T>(valeur: T, delaiMs: number): T {
  const [debouncee, setDebouncee] = useState(valeur);
  useEffect(() => {
    const t = setTimeout(() => setDebouncee(valeur), delaiMs);
    return () => clearTimeout(t);
  }, [valeur, delaiMs]);
  return debouncee;
}

/** Delai de stabilisation de la saisie avant de verifier les dispos (400-600 ms recommande). */
export const DELAI_DISPO_MS = 500;
