// Modele du mail au conseil syndical pour une date de CS / AG (increment 2 "dates CS/AG",
// demande patron). Logique PURE (domaine, ADR-001) : compose l'objet + le corps a partir
// des infos de la reunion. C'est un POINT DE DEPART : le gestionnaire relit et modifie
// tout (destinataires, objet, corps) dans l'UI avant d'envoyer. La signature n'est PAS
// dans le corps : elle est injectee a l'envoi (Signitic), comme pour Mes emails.

import { formatDateLongue, formatHeure } from "@/lib/format-date";

export type TypeReunion = "AG" | "CS";

export interface InfosMailReunion {
  type: TypeReunion;
  /** Code affiche de la copro, ex "S046". */
  coproCode: string;
  /** Nom de la copro, ex "Residence Les Acacias". */
  coproNom: string;
  /** Date ISO "YYYY-MM-DD" de la reunion. */
  dateISO: string;
  /** Heure "HH:mm" si connue ; absente = reunion sans heure precise. */
  heure?: string;
  /** Libelle de la salle reservee (depuis RESSOURCES_REAL31), si presente. */
  salleLibelle?: string;
  /** true = date deja confirmee par le CS ; false = encore a confirmer (mention ajoutee). */
  confirme: boolean;
}

const LIBELLE: Record<TypeReunion, string> = {
  CS: "Conseil syndical",
  AG: "Assemblée générale",
};

/** "2026-04-12" -> "12/04/2026" (date numerique pour l'objet). Deterministe. */
function dateNumerique(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Objet du mail, ex "S046 - Conseil syndical du 12/04/2026 à 18h00". Sans heure connue,
 * on s'arrete a la date. Format demande par le patron (reference copro en tete).
 */
export function objetMailReunion(infos: InfosMailReunion): string {
  const base = `${infos.coproCode} - ${LIBELLE[infos.type]} du ${dateNumerique(infos.dateISO)}`;
  return infos.heure ? `${base} à ${formatHeure(infos.heure)}` : base;
}

/**
 * Corps du mail (texte brut, saut de ligne = \n ; l'UI/adapter le rend en HTML). Ton
 * syndic sobre, vouvoiement, demande de confirmation de presence. Mentionne la salle si
 * reservee et signale "date a confirmer" tant que le CS n'a pas valide. Pas de signature
 * ici (Signitic l'ajoute a l'envoi).
 */
export function corpsMailReunion(infos: InfosMailReunion): string {
  const quand = infos.heure
    ? `le ${formatDateLongue(infos.dateISO)} à ${formatHeure(infos.heure)}`
    : `le ${formatDateLongue(infos.dateISO)}`;
  const lignes: string[] = ["Bonjour,", ""];

  if (infos.type === "CS") {
    lignes.push(
      `Un conseil syndical de la copropriété ${infos.coproNom} (${infos.coproCode}) est prévu ${quand}.`,
    );
  } else {
    lignes.push(
      `L'assemblée générale de la copropriété ${infos.coproNom} (${infos.coproCode}) est prévue ${quand}.`,
    );
  }

  if (infos.salleLibelle) {
    lignes.push("", `Lieu de la réunion : ${infos.salleLibelle}.`);
  }

  if (!infos.confirme) {
    lignes.push(
      "",
      "Cette date reste à confirmer par le conseil syndical : merci de nous indiquer si elle vous convient.",
    );
  }

  if (infos.type === "AG") {
    lignes.push(
      "",
      "La convocation officielle, accompagnée de l'ordre du jour, vous parviendra dans les délais légaux.",
    );
  }

  lignes.push(
    "",
    "Nous vous remercions de bien vouloir nous confirmer votre présence.",
    "",
    "Bien cordialement,",
  );
  return lignes.join("\n");
}
