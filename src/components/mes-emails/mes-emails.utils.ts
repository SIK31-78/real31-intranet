import { formatDateLongue } from "@/lib/format-date";
import { initialesDe } from "@/lib/domain/collaborateur";

// Helpers de PRESENTATION partages par les morceaux de l'ecran « Mes e-mails ».
// Les regles metier (sujet, destinataires, dossier propose...) vivent dans le domaine.

export type Statut = "nouveau" | "repondu" | "classe";

export type VueBoite = "recus" | "traites" | "tous";

/** Le corps a afficher : complet, ou l'extrait en attendant la suite. */
export type CorpsAffiche = { texte: string; etat: "complet" | "chargement" | "indisponible" };

export function jourMois(iso: string): string {
  return formatDateLongue(iso).replace(/ \d{4}$/, "");
}

export function formatTaille(octets: number): string {
  if (octets >= 1_000_000) return `${(octets / 1_000_000).toFixed(1)} Mo`;
  if (octets >= 1000) return `${Math.round(octets / 1000)} Ko`;
  return `${octets} o`;
}

/** Initiales de l'expediteur (sans la qualite entre parentheses). */
export const initiales = (nom: string) => initialesDe(nom.replace(/ \(.*\)$/, ""));
