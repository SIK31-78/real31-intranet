// Alerte "delai court" a la POSE d'une date de prochaine AG (demande Sekou 2026-07-28 :
// "une alerte si l'AG est dans moins de 6 semaines, car delai short pour faire CS +
// convocation").
//
// Pur, deterministe. AUCUNE constante nouvelle ici : les seuils sont les jalons du
// cabinet deja definis (ADR-006, cabinet/real31-defaults.ts). Poser des jours en dur a
// cote aurait cree un second referentiel de delais, qui aurait diverge au premier
// ajustement du bareme.
//
// Le seuil de declenchement est le PREMIER acte de la chaine (retroplanning revu le
// 2026-09-11) : des qu'on ne peut plus preparer l'ODJ du CS dans les temps, il y a
// quelque chose a dire. Alerter seulement a la validation laissait passer une AG dont
// la preparation etait deja en retard.
//
// Trois jalons portent la contrainte quand on choisit une date d'AG :
//   - ODJ_PREP (J-49) : l'ODJ du CS doit etre prepare et envoye au conseil.
//   - ODJ_CS   (J-35) : l'ODJ de l'AG doit etre valide avec le conseil.
//   - CONVOC   (J-31) : la mise sous pli, avec pour plancher le legal 21 jours FRANCS
//                       (soit J-22, recule au jour ouvre precedent).
// On n'invente pas ces dates : on les LIT dans calculerJalons(), donc elles heritent
// gratuitement du recul en jour ouvre et de la regle "la plus contraignante gagne".
//
// On AVERTIT, on ne bloque JAMAIS : une AG a 3 semaines reste parfois la seule option
// (AG sur seconde convocation, urgence, contrainte de salle). C'est le gestionnaire qui
// tranche, l'intranet l'informe.

import { calculerJalons } from "./calculator";
import { DELAIS_CABINET } from "./cabinet/real31-defaults";

/** Gravite du delai restant avant l'AG. "ok" = rien a signaler. */
export type NiveauDelaiAg = "court" | "critique";

export interface AlerteDelaiAg {
  /** "court" : la chaine de preparation est deja entamee (AG a moins de 49 j).
   *  "critique" : la mise sous pli ne peut plus partir dans les temps. */
  niveau: NiveauDelaiAg;
  /** Jours calendaires entre aujourd'hui et l'AG (>= 0). */
  joursAvant: number;
  /** Semaines pleines avant l'AG (arrondi bas), pour un libelle lisible. */
  semainesAvant: number;
  /** Cible "ODJ du CS prepare et envoye au conseil" (J-49). */
  odjPrepISO: string;
  /** Cible "ODJ de l'AG valide avec le CS" (J-35). */
  odjCsISO: string;
  /** Cible "Mise sous pli" (J-31 cabinet ou plancher legal, en jour ouvre). */
  convocISO: string;
  /** Ces cibles sont-elles deja derriere nous ? */
  odjPrepDepasse: boolean;
  odjCsDepasse: boolean;
  convocDepassee: boolean;
}

function joursEntre(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split("-").map(Number);
  const [by, bm, bd] = bISO.split("-").map(Number);
  return (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000;
}

/**
 * Alerte de delai pour une date de PROCHAINE AG, ou `null` s'il n'y a rien a dire :
 * date malformee, date passee (c'est `avertissementDateReunion` qui parle alors, on ne
 * double pas le message), ou delai confortable (AG a 49 jours ou plus).
 *
 * `agISO` et `aujourdhuiISO` au format 'YYYY-MM-DD'.
 */
export function alerteDelaiAg(agISO: string, aujourdhuiISO: string): AlerteDelaiAg | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(agISO) || !/^\d{4}-\d{2}-\d{2}$/.test(aujourdhuiISO)) return null;
  const joursAvant = joursEntre(aujourdhuiISO, agISO);
  // Date passee (ou jour meme) : hors sujet ici.
  if (joursAvant <= 0) return null;
  // Delai confortable : la preparation de l'ODJ du CS tient encore.
  if (joursAvant >= DELAIS_CABINET.ODJ_PREP_JOURS) return null;

  const jalons = calculerJalons(agISO);
  // calculerJalons renvoie toujours tous les jalons : ces trois-la en font partie.
  const odjPrepISO = jalons.find((j) => j.code === "ODJ_PREP")!.cibleDate;
  const odjCsISO = jalons.find((j) => j.code === "ODJ_CS")!.cibleDate;
  const convocISO = jalons.find((j) => j.code === "CONVOC")!.cibleDate;

  return {
    // La mise sous pli est le point de non-retour : passe cette date, la convocation
    // ne part plus dans les temps -> critique. Avant, c'est la preparation qui serre.
    niveau: convocISO <= aujourdhuiISO ? "critique" : "court",
    joursAvant,
    semainesAvant: Math.floor(joursAvant / 7),
    odjPrepISO,
    odjCsISO,
    convocISO,
    odjPrepDepasse: odjPrepISO <= aujourdhuiISO,
    odjCsDepasse: odjCsISO <= aujourdhuiISO,
    convocDepassee: convocISO <= aujourdhuiISO,
  };
}
