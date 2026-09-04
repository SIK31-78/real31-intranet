// Modele du mail au conseil syndical pour PROPOSER les dates de CS / AG (increment 2
// "dates CS/AG", demande patron). Logique PURE (domaine, ADR-001) : compose l'objet +
// le corps a partir des dates posees. C'est un POINT DE DEPART : le gestionnaire relit
// et modifie TOUT (destinataires, objet, corps) dans l'UI avant d'envoyer. La signature
// n'est PAS dans le corps : elle est injectee a l'envoi (Signitic), comme "Mes emails".
//
// UN SEUL mail couvre les deux dates (verbatim du cabinet, 2026-07) : on propose
// ensemble le CS preparatoire ET l'AG. Si une seule des deux est a venir, on ne met
// que la ligne correspondante et l'intro s'adapte.

import { formatHeure } from "@/lib/format-date";
import { HEURE_DEFAUT_REUNION } from "@/lib/domain/reunion";
import type { ModeReunion } from "@/lib/domain/confirmation-evenement";

/** Une date de reunion a proposer (CS ou AG) telle qu'injectee dans le mail. */
export interface DateReunionMail {
  /** Date ISO "YYYY-MM-DD". */
  dateISO: string;
  /** Heure "HH:mm" si connue ; absente = 18h00 par defaut (verbatim cabinet). */
  heure?: string;
  /** Mode de tenue ; absent = on n'ecrit pas de parenthese (on n'invente rien). */
  mode?: ModeReunion;
  /** Libelle de la salle reservee (RESSOURCES_REAL31) ; mentionne si mode presentiel/hybride. */
  salleLibelle?: string;
}

export interface InfosMailDatesReunion {
  /** Code affiche de la copro, ex "S046". */
  coproCode: string;
  /** Nom de la copro, ex "Residence Les Acacias". */
  coproNom: string;
  /** Adresse courte de la copro pour l'objet, ex "12 rue Gabriel Peri COURBEVOIE" (demande Sekou). */
  coproAdresse?: string;
  /** Date de CS preparatoire a proposer (absente = pas de CS a venir). */
  cs?: DateReunionMail;
  /** Date d'AG a proposer (absente = pas d'AG a venir). */
  ag?: DateReunionMail;
  /** Date ISO "YYYY-MM-DD" a laquelle on confirmera sauf avis contraire (J+7 calcule). */
  dateConfirmationISO: string;
}

/** Parenthese de mode, verbatim cabinet. Mode absent -> pas de parenthese. */
const MODE_PHRASE: Record<ModeReunion, string> = {
  visio: "en visio",
  presentiel: "en présentiel",
  hybride: "en hybride visio + présentiel",
};

/** "2026-04-12" -> "12/04/2026" (date numerique FR). Deterministe. */
function dateNumerique(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Date de confirmation "sauf avis contraire" : aujourd'hui + 7 jours. Calcul en UTC
 * (deterministe, gere fins de mois) a partir d'une date ISO "YYYY-MM-DD".
 */
export function dateConfirmationJ7(aujourdhuiISO: string): string {
  const d = new Date(`${aujourdhuiISO.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

/** Fragment "le JJ/MM/AAAA à XXhXX (mode), salle ..." d'une date proposee. */
function fragmentDate(d: DateReunionMail): string {
  const heure = formatHeure(d.heure ?? HEURE_DEFAUT_REUNION);
  let frag = `le ${dateNumerique(d.dateISO)} à ${heure}`;
  if (d.mode) frag += ` (${MODE_PHRASE[d.mode]})`;
  // Salle mentionnee seulement en presentiel / hybride (une visio n'a pas de salle).
  if (d.salleLibelle && (d.mode === "presentiel" || d.mode === "hybride")) {
    frag += `, salle ${d.salleLibelle}`;
  }
  return frag;
}

/**
 * Objet du mail. Deux dates -> "S046 - Dates de CS et d'AG à fixer" ; une seule ->
 * variante ("Date de CS à fixer" / "Date d'AG à fixer"). Reference copro en tete.
 */
export function objetMailDatesReunion(infos: InfosMailDatesReunion): string {
  const quoi =
    infos.cs && infos.ag
      ? "Dates de CS et d'AG à fixer"
      : infos.cs
        ? "Date de CS à fixer"
        : "Date d'AG à fixer";
  // Demande Sekou (2026-07-10) : reference + adresse de la copro dans l'objet.
  const adresse = infos.coproAdresse ? ` - ${infos.coproAdresse}` : "";
  return `${infos.coproCode}${adresse} - ${quoi}`;
}

/**
 * Corps du mail (texte brut, \n ; l'adapter le rend en HTML). VERBATIM du cabinet
 * (2026-07) : on ne reformule pas le ton, on injecte seulement les dates / heures /
 * modes / salles et la date de confirmation J+7. Pas de signature ici (Signitic
 * l'ajoute a l'envoi). Au moins une des deux dates (cs / ag) doit etre presente.
 */
export function corpsMailDatesReunion(infos: InfosMailDatesReunion): string {
  // Intro adaptee selon les dates a proposer (verbatim tail).
  const objetIntro =
    infos.cs && infos.ag
      ? "les dates de CS et d'AG"
      : infos.cs
        ? "la date du CS préparatoire"
        : "la date de l'assemblée générale";

  const lignes: string[] = [
    "Bonjour à tous,",
    "",
    `Afin de préparer la prochaine assemblée générale, nous vous proposons de fixer dès à présent ${objetIntro}.`,
    "",
    "Nous vous proposons donc :",
  ];

  if (infos.cs) lignes.push(`- pour la tenue du CS préparatoire ${fragmentDate(infos.cs)}`);
  if (infos.ag) lignes.push(`- pour l'assemblée ${fragmentDate(infos.ag)}`);

  // Accord singulier/pluriel : le mail propose souvent CS ET AG - "nous confirmerons la
  // date" au singulier faisait tiquer les collegues (retour Sekou 2026-09-04).
  const deuxDates = Boolean(infos.cs && infos.ag);
  lignes.push(
    "",
    `Sauf avis contraire nous confirmerons ${deuxDates ? "ces dates" : "cette date"} le ${dateNumerique(infos.dateConfirmationISO)}. En cas d'indisponibilité du Conseil Syndical, nous vous remercions de revenir vers nous avec deux dates afin que nous puissions ${deuxDates ? "les" : "la"} fixer.`,
    "",
    "Vous pouvez également dès à présent me faire part des éventuels sujets à mettre à l'ordre du jour.",
    "",
    "Cordialement,",
  );
  return lignes.join("\n");
}
