// Retard de recap d'AG : « une AG s'est tenue, le recap n'est pas rentre ».
//
// Demande Sekou : le gestionnaire a 7 jours apres l'AG pour rendre son recap ; passe ce
// delai, la copro sort en rouge cote gestionnaire ET cote comptable. Domaine PUR (ADR-001) :
// aucune I/O, la date du jour est toujours passee en parametre pour rester testable.
//
// Trois constantes, chacune calibree sur la vraie data (264 copros, 304 recaps importes
// du PowerApps) - ne pas les changer sans remesurer, elles ne sont pas arbitraires.

/**
 * Delai laisse au gestionnaire pour rendre le recap apres l'AG. Une AG tenue depuis 8
 * jours ou plus sans recap est EN RETARD ; a 7 jours pile on ne dit encore rien.
 */
export const DELAI_RECAP_JOURS = 7;

/**
 * Tolerance pour rapprocher un recap de son AG, en jours (de part et d'autre).
 *
 * POURQUOI : la date d'AG du referentiel (`nextAGDate` / `lastAGDate`) et la date REELLE
 * de la tenue divergent souvent - mesure sur la vraie data, S021 a 1 jour d'ecart, S179
 * en a 5. Sans tolerance, 9 copros ressortaient « recap manquant » alors que le recap
 * etait la, a quelques jours de la date du referentiel. Un recap dans la fenetre
 * [AG - 15 j ; AG + 15 j] compte donc pour cette AG.
 */
export const TOLERANCE_RAPPROCHEMENT_JOURS = 15;

/**
 * Debut du SUIVI des recaps : seules les AG tenues a partir de cette date sont
 * surveillees.
 *
 * POURQUOI (decision Sekou 2026-09-08) : le module recap est reellement en service
 * depuis le 01/09/2026. Avant, les recaps arrivaient par d'autres canaux (PowerApps,
 * mails) et l'antériorite non saisie est du bruit d'archive irrattrapable : la
 * signaler noierait l'alerte. Le premier calibrage (2025-03-31 = plus ancien recap
 * importe du PowerApps) est remplace par cette date de mise en service.
 */
export const DEBUT_HISTORIQUE_RECAPS = "2026-09-01";

/**
 * Au-dela de cette anciennete, on ne signale plus l'absence de recap.
 *
 * POURQUOI (decision Sekou 2026-08-17) : passe un an, l'exercice comptable de l'AG est
 * clos et la compta a fait le travail par ses propres moyens. Le recap manquant n'a plus
 * d'objet - et surtout il est IRRATTRAPABLE : personne ne reconstitue de memoire le budget
 * vote d'une AG d'il y a 18 mois. Les laisser rouges pour toujours abimerait l'alerte
 * entiere : une liste ou 7 lignes sur 30 ne partiront jamais finit par ne plus etre lue.
 *
 * Subsumee par DEBUT_HISTORIQUE_RECAPS jusqu'au 01/09/2027 (toute AG de plus d'un an est
 * alors forcement avant le seuil) ; elle redeviendra la borne active ensuite.
 *
 * Ce n'est PAS un masquage de donnee fausse (cf. les dates previsionnelles, qu'on affiche
 * justement parce qu'elles sont corrigeables) : ici il n'y a rien a corriger.
 */
export const ANCIENNETE_MAX_JOURS = 365;

/**
 * D'ou vient la date d'AG surveillee :
 *  - `prochaine` : la date PREVISIONNELLE du referentiel, deja passee et jamais conclue.
 *    C'est aussi le cas ou la date elle-meme est suspecte (dates de remplissage type
 *    30/06 posees en masse dans le referentiel) -> l'UI le dit, elle ne le masque pas.
 *  - `derniere`  : la derniere AG effectivement tenue. La date, elle, est fiable.
 */
export type OrigineAgSurveillee = "prochaine" | "derniere";

export interface AgSurveillee {
  /** Jour de l'AG, ISO "YYYY-MM-DD". */
  date: string;
  origine: OrigineAgSurveillee;
}

export type EtatRecapAg =
  /** Rien a dire : pas d'AG datee, AG a venir, encore dans le delai, ou hors historique. */
  | { statut: "rien_a_signaler" }
  /** Un recap couvre cette AG (a la tolerance pres). */
  | { statut: "a_jour" }
  /** AG passee, aucun recap, delai depasse. */
  | { statut: "en_retard"; joursDeRetard: number };

const RIEN: EtatRecapAg = { statut: "rien_a_signaler" };

/** Ecart en jours entre deux dates ISO "YYYY-MM-DD" (positif si b est apres a). */
function joursEntre(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split("-").map(Number);
  const [by, bm, bd] = bISO.split("-").map(Number);
  return (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000;
}

/**
 * Quelle AG surveiller pour cette copro ? La PROCHAINE si sa date est deja passee (le
 * cycle n'a jamais ete conclu : soit l'AG s'est tenue sans recap, soit la date est
 * fausse), sinon la DERNIERE tenue. `undefined` si la copro n'a aucune date d'AG.
 *
 * Transposition exacte du SQL de cadrage :
 *   coalesce(case when "nextAGDate"::date < current_date then "nextAGDate"::date end,
 *            "lastAGDate"::date)
 */
export function agSurveillee(
  prochaineAgDate: string | undefined,
  derniereAgDate: string | undefined,
  aujourdhui: string,
): AgSurveillee | undefined {
  if (prochaineAgDate && prochaineAgDate < aujourdhui) {
    return { date: prochaineAgDate, origine: "prochaine" };
  }
  if (derniereAgDate) return { date: derniereAgDate, origine: "derniere" };
  return undefined;
}

/**
 * L'etat du recap pour UNE AG : `agDate` = le jour de l'AG surveillee, `datesRecaps` =
 * toutes les dates d'AG des recaps deja saisis pour CETTE copro, `aujourdhui` = le jour
 * de reference (ISO). Ordre des tests volontaire : un recap rapproche est un FAIT, il
 * prime sur le seuil d'historique.
 */
export function evaluerRecapAg(
  agDate: string | undefined,
  datesRecaps: readonly string[],
  aujourdhui: string,
): EtatRecapAg {
  if (!agDate) return RIEN;

  const couvert = datesRecaps.some(
    (d) => Math.abs(joursEntre(agDate, d)) <= TOLERANCE_RAPPROCHEMENT_JOURS,
  );
  if (couvert) return { statut: "a_jour" };

  // Avant le debut de l'historique connu, l'absence de recap ne prouve rien.
  if (agDate < DEBUT_HISTORIQUE_RECAPS) return RIEN;

  const joursDeRetard = joursEntre(agDate, aujourdhui);
  if (joursDeRetard <= DELAI_RECAP_JOURS) return RIEN;
  // Trop ancien : l'exercice est clos, la compta a fait le travail autrement.
  if (joursDeRetard > ANCIENNETE_MAX_JOURS) return RIEN;
  return { statut: "en_retard", joursDeRetard };
}
