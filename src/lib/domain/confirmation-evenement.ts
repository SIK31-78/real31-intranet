// Confirmation des dates de CS / AG (demande patron, 2026-07). Une date posee par le
// gestionnaire est d'abord PROVISOIRE : elle est proposee au conseil syndical par mail,
// et le planning affiche "AG a confirmer". Quand le CS valide par retour de mail, le
// gestionnaire clique "Confirmer" -> "AG confirmee". Logique PURE (domaine, ADR-001).

export type StatutConfirmation = "a_confirmer" | "confirme";

export interface ConfirmationEvenement {
  coproCode: string;
  type: "AG" | "CS";
  /** Date ISO "YYYY-MM-DD" de l'evenement au moment de la proposition / confirmation. */
  date: string;
  statut: StatutConfirmation;
  /** Horodatage ISO de la confirmation. */
  confirmeLe?: string;
  /** Initiales du gestionnaire qui a confirme. */
  confirmePar?: string;
  /** Id Graph de l'evenement Outlook projete (projection automatique de la date). */
  outlookEventId?: string;
  /** Email de l'agenda ou vit l'evenement projete (boite du gestionnaire). */
  outlookBoite?: string;
}

/**
 * Titre de l'evenement Outlook projete pour une date CS/AG. Outlook est un reflet
 * de la donnee intranet (decision Sekou 2026-07-08) : "S024 : AG à confirmer" tant
 * que le CS n'a pas valide, "S024 : AG confirmée" apres le clic Confirmer.
 * NOTE : les accents sont VOULUS ici (titre lisible dans Outlook) ; AG au feminin
 * (assemblee), CS au masculin (conseil).
 */
export function titreProjectionOutlook(
  coproCode: string,
  type: "AG" | "CS",
  statut: StatutConfirmation,
): string {
  const suffixe =
    statut === "confirme" ? (type === "AG" ? "confirmée" : "confirmé") : "à confirmer";
  return `${coproCode} : ${type} ${suffixe}`;
}

/**
 * Statut de confirmation applicable a la date ACTUELLE de l'evenement.
 * REGLE : replanifier une date invalide la confirmation. Si aucune confirmation n'est
 * enregistree, ou si la confirmation porte sur une autre date (la date a ete changee
 * depuis), la date redevient "a_confirmer" : le CS n'a pas valide CETTE date-la.
 */
export function statutPourDate(
  confirmation: ConfirmationEvenement | null,
  dateActuelle: string,
): StatutConfirmation {
  if (!confirmation) return "a_confirmer";
  if (confirmation.date !== dateActuelle) return "a_confirmer"; // date replanifiee depuis
  return confirmation.statut;
}

/** Borne d'exercice "jj/mm" -> date ISO complete pour `annee` ; null si illisible. */
function borneISO(jjmm: string, annee: number): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(jjmm.trim());
  if (!m) return null;
  const jour = Number(m[1]);
  const mois = Number(m[2]);
  if (jour < 1 || jour > 31 || mois < 1 || mois > 12) return null;
  return `${annee}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

/**
 * Une AG passee dont la date tombe dans l'exercice comptable EN COURS est masquee du
 * planning : elle a eu lieu, la prochaine AG sera celle de l'exercice suivant (ex. AG
 * tenue le 16/04 pour un exercice clos le 31/12 -> plus rien a afficher cette annee).
 *
 * Exercice en cours : les bornes "jj/mm" sont projetees en dates completes autour de
 * `today`. Le debut courant est la derniere occurrence de la borne debut <= today ;
 * la fin est la PROCHAINE occurrence de la borne fin >= debut courant (gere l'exercice
 * a cheval, ex 01/07 -> 30/06). Exercice illisible -> false (on ne masque pas, prudence).
 */
export function agMasqueeCarTenue(
  dateEvenement: string,
  exercice: { debut: string; fin: string },
  today: string,
): boolean {
  // Une AG future (ou du jour meme) n'est jamais masquee.
  if (!(dateEvenement < today)) return false;

  const annee = Number(today.slice(0, 4));
  if (!Number.isInteger(annee)) return false;

  // Debut de l'exercice en cours : occurrence de la borne debut la plus recente <= today.
  let debut = borneISO(exercice.debut, annee);
  if (!debut) return false; // exercice illisible -> on ne masque pas
  if (debut > today) debut = borneISO(exercice.debut, annee - 1);
  if (!debut) return false;

  // Fin de l'exercice en cours : prochaine occurrence de la borne fin >= debut courant.
  const anneeDebut = Number(debut.slice(0, 4));
  let fin = borneISO(exercice.fin, anneeDebut);
  if (!fin) return false;
  if (fin < debut) fin = borneISO(exercice.fin, anneeDebut + 1);
  if (!fin) return false;

  return dateEvenement >= debut && dateEvenement <= fin;
}
