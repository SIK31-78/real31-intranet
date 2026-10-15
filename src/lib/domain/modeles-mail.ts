// Modèles de mail STOCKÉS (REA-296) : l'équipe les modifie sans développeur, depuis
// /admin/modeles-mail. Décisions de Sekou du 15/10/2026 : un modèle appartient à une agence
// (code ML / LGC / HLS / ASN) ou à tout le cabinet ; seuls les admins et les responsables
// d'agence les modifient. Ce sont les mails SIMPLES, écrits à une personne : les
// communications à la copropriété vont dans les modèles de mailing ESTALE.
// Domaine pur.

import { MODELE_CLES, type ModeleMail, type VariablesModele } from "./mes-emails-composition";

export interface ModeleMailStocke extends ModeleMail {
  /** Code d'agence (« HLS ») ; null = tout le cabinet. */
  agence: string | null;
  /** false = retiré des listes sans être supprimé. */
  actif: boolean;
  auteurEmail?: string;
  majLe?: string;
}

/** La table n'existe pas encore (SQL à passer). */
export class ModelesMailNonConfigureError extends Error {
  constructor() {
    super("La table des modèles de mail n'existe pas encore (SQL à passer).");
    this.name = "ModelesMailNonConfigureError";
  }
}

/** Les variables proposées dans l'aide de l'écran d'édition. */
export const VARIABLES_MODELE: { cle: keyof VariablesModele; libelle: string }[] = [
  { cle: "copro_code", libelle: "Code de la copropriété (S0247)" },
  { cle: "copro_nom", libelle: "Nom de la copropriété" },
  { cle: "copro_adresse", libelle: "Adresse de la copropriété" },
  { cle: "destinataire_nom", libelle: "Nom du destinataire" },
  { cle: "gestionnaire_nom", libelle: "Votre nom" },
  { cle: "gestionnaire_initiales", libelle: "Vos initiales" },
  { cle: "agence", libelle: "Agence" },
  { cle: "date", libelle: "Date du jour" },
];

/** Les {{variables}} d'un texte que la fusion ne connaît pas (à corriger avant d'enregistrer). */
export function variablesInconnues(texte: string): string[] {
  const inconnues = [...texte.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)]
    .map((m) => m[1] ?? "")
    .filter((cle) => !(cle.toLowerCase() in MODELE_CLES));
  return [...new Set(inconnues)];
}

/**
 * Les modèles proposés à une agence : ceux de l'agence d'abord, puis ceux du cabinet, par
 * titre. Agence inconnue : seulement ceux du cabinet.
 */
export function modelesPourAgence(liste: ModeleMailStocke[], agence: string | null | undefined): ModeleMail[] {
  const code = (agence ?? "").trim().toUpperCase();
  return liste
    .filter((m) => m.actif && (m.agence === null || (code !== "" && m.agence.toUpperCase() === code)))
    .sort((a, b) => Number(a.agence === null) - Number(b.agence === null) || a.titre.localeCompare(b.titre, "fr"))
    .map(({ id, titre, sujet, corps }) => ({ id, titre, sujet, corps }));
}
