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

  return avecFin
    .map(({ copro: c, fin }) => {
      const cycle = cycleSuivant(fin);
      const anneeBareme = Number(cycle.debut.slice(0, 4));
      return {
        coproCode: c.code,
        nom: c.nom,
        finMandatISO: fin,
        debutISO: cycle.debut,
        finISO: cycle.fin,
        joursAvant: jours(aujourdhuiISO, fin),
        anneeBareme,
        baremeComplet: completude.get(anneeBareme) ?? false,
      };
    })
    // Le plus urgent d'abord : mandat echu, puis mandat le plus proche de son terme.
    .sort((a, b) => a.finMandatISO.localeCompare(b.finMandatISO));
}
