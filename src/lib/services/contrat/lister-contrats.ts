// Service : les contrats de syndic a preparer sur le portefeuille du gestionnaire.
//
// C'est l'ecran d'entree du module (le `NewContractScreen` du canvas PowerApps MYTHEC
// choisissait une copro dans une liste ; ici la liste dit AUSSI ce qui presse et ce qui
// bloque). Lecture seule.
//
// Passe par le routeur (ADR-001).

import { getFacturationRepository } from "@/lib/adapters/router";
import { listerCoprosParRequete } from "@/lib/services/coproprietes/lister-copros-cache";
import { cycleSuivant, finContratEnCours } from "@/lib/domain/contrat/cycle-contrat";
import { PRESTATIONS_CONTRAT } from "@/lib/domain/contrat/champs-contrat";
import { calculerJalons } from "@/lib/domain/jalons-ag/calculator";

/** Une copropriete et le contrat qui vient. */
export interface LigneContratAPreparer {
  coproCode: string;
  nom: string;
  /** Fin du mandat en cours, ISO. */
  finMandatISO: string;
  /** Cycle suivant, deduit de cette fin. */
  debutISO: string;
  finISO: string;
  /** Jours restants avant la fin du mandat (negatif = mandat deja echu). */
  joursAvant: number;
  /** AG qui votera ce contrat, si elle est planifiee dans l'intranet ET encore a venir. */
  dateAgISO: string | null;
  /**
   * La date d'AG du referentiel est DEJA PASSEE : l'assemblee s'est tenue et personne
   * n'a fait glisser la date en « derniere AG ». Ce n'est donc PAS un retard, c'est une
   * date perimee - et la prochaine AG reste a planifier. Au 2026-09-11, 64 coproprietes
   * du cabinet sont dans ce cas ; les compter comme en retard remplissait l'ecran de
   * rouge pour rien.
   */
  agDatePerimee: string | null;
  /** Mise sous pli de la convocation (jalon CONVOC), qui est le MOMENT de generer. */
  dateConvocationISO: string | null;
  /** Jours restants avant cette mise sous pli (negatif = elle est passee). null si l'AG
   *  n'est pas encore planifiee. */
  joursAvantConvocation: number | null;
  /** Annee du bareme qui s'appliquera (= annee de debut du cycle). */
  anneeBareme: number;
  /**
   * Le bareme de cette annee porte-t-il les 21 prestations du contrat ?
   * false = le contrat ne pourra pas etre edite tant que `intranet_tarifs` n'est pas
   * complete. On le dit ICI plutot que de laisser le gestionnaire le decouvrir en
   * cliquant : au 2026-09-11, 95 coproprietes sont dans ce cas pour l'annee 2027.
   */
  baremeComplet: boolean;
}

export async function listerContratsAPreparer(
  managerId: string,
  aujourdhuiISO: string,
): Promise<LigneContratAPreparer[]> {
  const copros = await listerCoprosParRequete(managerId);
  const repo = getFacturationRepository();

  // La fin du contrat EN COURS croise deux sources : le referentiel App A, qui n'est PAS
  // mis a jour au renouvellement, et le dernier cycle enregistre par l'intranet, qui l'est
  // (cf. finContratEnCours). Sans ce croisement, la liste annoncait « echu » des contrats
  // signes - constat de Sekou sur FOCH31.
  const contrats = await repo.listerDerniersContrats(copros.map((c) => c.code));
  const avecFin = copros
    .map((copro) => {
      const fin = finContratEnCours(copro.mandatSyndicFin, contrats.get(copro.code)?.debutContrat);
      return fin ? { copro, fin } : null;
    })
    .filter((x): x is { copro: (typeof copros)[number]; fin: string } => x !== null);

  // Les cycles ne couvrent que quelques annees : on lit CHAQUE bareme une fois, pas un
  // par copropriete.
  const annees = new Set(avecFin.map((x) => Number(cycleSuivant(x.fin).debut.slice(0, 4))));
  const completude = new Map<number, boolean>();
  await Promise.all(
    [...annees].map(async (annee) => {
      const lignes = await repo.listerBareme(annee);
      const presentes = new Set(lignes.map((l) => l.identifiantPrestation));
      completude.set(annee, PRESTATIONS_CONTRAT.every((p) => presentes.has(p)));
    }),
  );

  const jours = (deISO: string, aISO: string) =>
    Math.round((Date.parse(`${aISO}T00:00:00Z`) - Date.parse(`${deISO}T00:00:00Z`)) / 86_400_000);

  return (
    avecFin
      .map(({ copro: c, fin }) => {
        const cycle = cycleSuivant(fin);
        const anneeBareme = Number(cycle.debut.slice(0, 4));
        const agReferentiel = c.prochaineAg?.date ?? null;
        const perimee = agReferentiel !== null && agReferentiel < aujourdhuiISO;
        const dateAgISO = perimee ? null : agReferentiel;
        const dateConvocationISO = dateAgISO
          ? (calculerJalons(dateAgISO).find((j) => j.code === "CONVOC")?.cibleDate ?? null)
          : null;
        return {
          coproCode: c.code,
          nom: c.nom,
          finMandatISO: fin,
          debutISO: cycle.debut,
          finISO: cycle.fin,
          joursAvant: jours(aujourdhuiISO, fin),
          dateAgISO,
          agDatePerimee: perimee ? agReferentiel : null,
          dateConvocationISO,
          joursAvantConvocation: dateConvocationISO
            ? jours(aujourdhuiISO, dateConvocationISO)
            : null,
          anneeBareme,
          baremeComplet: completude.get(anneeBareme) ?? false,
        };
      })
      // Ordre = l'ordre de TRAVAIL, pas l'ordre des echeances : le contrat se prepare
      // au moment de la convocation, pas quand le mandat expire (les deux sont separes
      // de ~2 mois en median sur le portefeuille). Les copros dont l'AG est planifiee
      // passent donc devant, triees par mise sous pli ; les autres suivent, triees par
      // fin de mandat - pour celles-la il faut d'abord poser une date d'AG.
      .sort((a, b) => {
        if (a.dateConvocationISO && b.dateConvocationISO) {
          return a.dateConvocationISO.localeCompare(b.dateConvocationISO);
        }
        if (a.dateConvocationISO) return -1;
        if (b.dateConvocationISO) return 1;
        return a.finMandatISO.localeCompare(b.finMandatISO);
      })
  );
}
