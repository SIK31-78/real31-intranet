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
import { etatContrat, type EtatContrat } from "@/lib/domain/contrat/etat-contrat";

/** Une copropriete et le contrat qui vient. */
export interface LigneContratAPreparer {
  coproCode: string;
  nom: string;
  /** Fin du mandat en cours, ISO. */
  finMandatISO: string;
  /** Cycle suivant propose : lendemain de cette fin, et un an - 1 jour. Le gestionnaire
   *  peut en changer a l'edition (duree libre). */
  debutISO: string;
  finISO: string;
  /** Jours restants avant la fin du mandat (negatif = mandat deja echu). */
  joursAvant: number;
  /** AG qui votera ce contrat, si elle est planifiee dans l'intranet ET encore a venir.
   *  Pour un contrat « genere » dont le referentiel n'a pas la date, c'est celle du
   *  contrat (voir `agDapresContrat`). */
  dateAgISO: string | null;
  /** true = `dateAgISO` vient du contrat edite, pas du referentiel : la date d'AG est a
   *  poser sur la fiche. */
  agDapresContrat: boolean;
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
  /** Ou en est le contrat dans son cycle de vie (cf. domain/contrat/etat-contrat). */
  etat: EtatContrat;
  /** Derniere edition REUSSIE : quand, par qui, pour quelle AG. null si jamais edite. */
  derniereEdition: { creeLeISO: string; par: string | null; dateAgISO: string | null } | null;
  /**
   * Valeurs proposees a l'edition, meme precedence que get-contrat : la derniere edition
   * reussie (elle porte l'augmentation votee) avant le contrat en cours. null = inconnu,
   * le gestionnaire saisit.
   */
  honorairesTtc: number | null;
  forfaitPostauxTtc: number | null;
  /** Annee du bareme qui s'appliquera : celle de l'AG (regle MYTHEC). null sans AG. */
  anneeBareme: number | null;
  /**
   * Le bareme de cette annee porte-t-il les 21 prestations du contrat ?
   * false = le contrat ne pourra pas etre edite tant que `intranet_tarifs` n'est pas
   * complete. On le dit ICI plutot que de laisser le gestionnaire le decouvrir en
   * cliquant. true quand il n'y a pas d'AG : rien a bloquer.
   */
  baremeComplet: boolean;
}

const RANG_ETAT: Record<EtatContrat, number> = {
  "a-generer": 0,
  genere: 1,
  "recap-a-faire": 2,
  "a-planifier": 3,
};

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
  const codes = copros.map((c) => c.code);
  const [contrats, editions] = await Promise.all([
    repo.listerDerniersContrats(codes),
    repo.listerEditionsContrats(codes),
  ]);
  const avecFin = copros
    .map((copro) => {
      const dernier = contrats.get(copro.code);
      const fin = finContratEnCours(copro.mandatSyndicFin, dernier?.debutContrat, dernier?.finContrat);
      return fin ? { copro, fin } : null;
    })
    .filter((x): x is { copro: (typeof copros)[number]; fin: string } => x !== null);

  // Le bareme est celui de l'annee de l'AG (regle MYTHEC, cf. get-contrat). Les AG a
  // venir tiennent sur une ou deux annees : on lit CHAQUE bareme une fois, pas un par
  // copropriete.
  const annees = new Set(
    avecFin
      .map((x) => x.copro.prochaineAg?.date)
      .filter((d): d is string => Boolean(d) && d! >= aujourdhuiISO)
      .map((d) => Number(d.slice(0, 4))),
  );
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
        const agReferentiel = c.prochaineAg?.date ?? null;
        const perimee = agReferentiel !== null && agReferentiel < aujourdhuiISO;
        const anneeBareme = agReferentiel && !perimee ? Number(agReferentiel.slice(0, 4)) : null;
        const reussie = (editions.get(c.code) ?? []).find((e) => e.statut === "termine") ?? null;
        const etat = etatContrat({
          aujourdhuiISO,
          prochaineAgISO: agReferentiel,
          derniereEditionAgISO: reussie?.dateAgISO ?? null,
          dernierCycleEnregistreLeISO: contrats.get(c.code)?.enregistreLeISO ?? null,
        });
        const agDapresContrat =
          etat === "genere" && (agReferentiel === null || perimee) && Boolean(reussie?.dateAgISO);
        const dateAgISO = agDapresContrat ? reussie!.dateAgISO : perimee ? null : agReferentiel;
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
          agDapresContrat,
          agDatePerimee: perimee ? agReferentiel : null,
          etat,
          derniereEdition: reussie
            ? { creeLeISO: reussie.creeLe.slice(0, 10), par: reussie.creePar, dateAgISO: reussie.dateAgISO }
            : null,
          honorairesTtc:
            reussie?.honorairesGestionTtc ?? contrats.get(c.code)?.honorairesGestionTtc ?? null,
          forfaitPostauxTtc:
            reussie?.forfaitPostauxTtc ?? contrats.get(c.code)?.forfaitPostauxTtc ?? null,
          dateConvocationISO,
          joursAvantConvocation: dateConvocationISO
            ? jours(aujourdhuiISO, dateConvocationISO)
            : null,
          anneeBareme,
          baremeComplet: anneeBareme === null ? true : (completude.get(anneeBareme) ?? false),
        };
      })
      // Ordre = l'ordre de TRAVAIL, pas l'ordre des echeances : le contrat se prepare
      // au moment de la convocation, pas quand le mandat expire (les deux sont separes
      // de ~2 mois en median sur le portefeuille). D'abord ce qu'il y a a generer, par
      // mise sous pli ; puis ce qui est genere et attend son AG ; puis les recaps qui
      // manquent ; enfin les copros sans AG, par fin de mandat.
      .sort((a, b) => {
        const rang = RANG_ETAT[a.etat] - RANG_ETAT[b.etat];
        if (rang !== 0) return rang;
        const ca = a.dateConvocationISO ?? a.dateAgISO ?? a.finMandatISO;
        const cb = b.dateConvocationISO ?? b.dateAgISO ?? b.finMandatISO;
        return ca.localeCompare(cb);
      })
  );
}
