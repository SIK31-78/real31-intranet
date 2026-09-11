// Alerte "delai court" a la POSE d'une date de prochaine AG (demande Sekou 2026-07-28 :
// "une alerte si l'AG est dans moins de 6 semaines, car delai short pour faire CS +
// convocation").
//
// Pur, deterministe. AUCUNE constante nouvelle ici : les seuils sont les jalons du
// cabinet deja definis (ADR-006, cabinet/real31-defaults.ts) -- les "6 semaines" de
// l'intuition metier tombent pile sur ODJ_CS_JOURS = 45 j (validation de l'ODJ avec le
// Conseil Syndical). Poser un 42 j en dur a cote aurait cree un second referentiel de
// delais qui aurait diverge au premier ajustement du bareme cabinet.
//
// Deux jalons portent la contrainte quand on choisit une date d'AG :
//   - ODJ_CS (J-45)  : le CS de validation de l'ODJ doit s'etre tenu.
//   - CONVOC (J-31)  : la mise sous pli, avec pour plancher le legal 21 jours FRANCS
//                      (soit J-22, recule au jour ouvre precedent).
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
  /** "court" : le CS de validation de l'ODJ est deja a echeance (AG a moins de 45 j).
   *  "critique" : la mise sous pli ne peut plus partir dans les temps. */
  niveau: NiveauDelaiAg;
  /** Jours calendaires entre aujourd'hui et l'AG (>= 0). */
  joursAvant: number;
  /** Semaines pleines avant l'AG (arrondi bas), pour un libelle lisible. */
  semainesAvant: number;
  /** Cible "ODJ valide avec le Conseil Syndical" (J-45). */
  odjCsISO: string;
  /** Cible "Mise sous pli" (J-31 cabinet ou plancher legal, en jour ouvre). */
  convocISO: string;
  /** Ces cibles sont-elles deja derriere nous ? */
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
 * double pas le message), ou delai confortable (AG a 45 jours ou plus).
 *
 * `agISO` et `aujourdhuiISO` au format 'YYYY-MM-DD'.
 */
export function alerteDelaiAg(agISO: string, aujourdhuiISO: string): AlerteDelaiAg | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(agISO) || !/^\d{4}-\d{2}-\d{2}$/.test(aujourdhuiISO)) return null;
  const joursAvant = joursEntre(aujourdhuiISO, agISO);
  // Date passee (ou jour meme) : hors sujet ici.
  if (joursAvant <= 0) return null;
  // Delai confortable : le CS de validation de l'ODJ tient encore.
  if (joursAvant >= DELAIS_CABINET.ODJ_CS_JOURS) return null;

  const jalons = calculerJalons(agISO);
  // calculerJalons renvoie toujours les 9 jalons : ODJ_CS et CONVOC en font partie.
  const odjCsISO = jalons.find((j) => j.code === "ODJ_CS")!.cibleDate;
  const convocISO = jalons.find((j) => j.code === "CONVOC")!.cibleDate;

  return {
    // La mise sous pli est le point de non-retour : passe cette date, la convocation
    // ne part plus dans les temps -> critique. Avant, c'est "seulement" le CS qui serre.
    niveau: convocISO <= aujourdhuiISO ? "critique" : "court",
    joursAvant,
    semainesAvant: Math.floor(joursAvant / 7),
    odjCsISO,
    convocISO,
    odjCsDepasse: odjCsISO <= aujourdhuiISO,
    convocDepassee: convocISO <= aujourdhuiISO,
  };
}
