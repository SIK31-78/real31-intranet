// Domaine PUR du RGD (Releve General des Depenses) - aucune I/O.
//
// Le RGD est le SEUL document du sortant qui porte la TVA, la part deductible et la part
// recuperable de chaque depense : le grand livre ne les a pas. La classe 6 du fichier
// d'import se construit donc "via le RGD, jamais le grand livre seul" : les ecritures
// viennent du GL (dates, sens, montants - la source qui boucle), les colonnes TVA /
// Deductible / Recuperable viennent de la ligne RGD APPARIEE.
//
// Regle d'appariement (mesuree sur S0303) : ligne a ligne sur (compte, date, |montant TTC|)
// avec CONSOMMATION UNIQUE de chaque ligne RGD - sinon deux montants identiques le meme jour
// se volent leur TVA. Residus LEGITIMES : GL sans RGD = travaux (art. 14-2, hors RGD) ;
// RGD sans GL classe 6 = compte 716. Tout autre residu est une anomalie a montrer.

import type { LigneEcriture } from "@/lib/reprise/domain/ecriture";

/** Une ligne du RGD du sortant. Montants SIGNES (une extourne est negative dans le RGD). */
export interface LigneRgd {
  /** Date ISO (AAAA-MM-JJ), normalisee comme les ecritures. */
  date: string;
  /** Compte de charge tel que la source le nomme (nomenclature du sortant). */
  compte: string;
  libelle?: string;
  /** Montant TTC SIGNE (les extournes / avoirs sont negatifs). */
  ttc: number;
  /** TVA signee. */
  tva?: number;
  /** Part deductible signee. */
  deductible?: number;
  /** Part recuperable (locataires) signee. */
  recuperable?: number;
  /** Cle de repartition portee par la section du RGD (les titres de section = les cles du sortant). */
  cle?: string;
}

/** Arrondi au centime (bruit flottant). */
function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Cle d'appariement (compte, date, |ttc| au centime). */
function cleAppariement(compte: string, date: string, montant: number): string {
  return `${compte}|${date}|${arrondi(Math.abs(montant)).toFixed(2)}`;
}

/** Resultat de l'appariement RGD <-> GL (classe 6). */
export interface AppariementRgdGl {
  /** index de la ligne GL (dans le tableau passe) -> ligne RGD consommee. */
  parIndexGl: Map<number, LigneRgd>;
  /** Lignes GL classe 6 restees sans vis-a-vis RGD (legitime : travaux). */
  residusGl: { index: number; ligne: LigneEcriture }[];
  /** Lignes RGD restees sans vis-a-vis GL (legitime : 716). */
  residusRgd: LigneRgd[];
}

/**
 * Apparie chaque ligne GL de CLASSE 6 a sa ligne RGD sur (compte, date, |ttc|), avec
 * consommation unique. Pur : meme entree => meme sortie (ordre d'apparition stable).
 */
export function apparierRgdGl(lignesGl: LigneEcriture[], rgd: LigneRgd[]): AppariementRgdGl {
  // File FIFO par cle : deux montants identiques le meme jour consomment deux lignes RGD.
  const dispo = new Map<string, LigneRgd[]>();
  for (const r of rgd) {
    const k = cleAppariement(r.compte, r.date, r.ttc);
    const file = dispo.get(k) ?? [];
    file.push(r);
    dispo.set(k, file);
  }

  const parIndexGl = new Map<number, LigneRgd>();
  const residusGl: { index: number; ligne: LigneEcriture }[] = [];
  lignesGl.forEach((l, index) => {
    if (l.classe !== 6) return;
    const k = cleAppariement(l.compte, l.date, l.montant);
    const file = dispo.get(k);
    const r = file?.shift();
    if (r) parIndexGl.set(index, r);
    else residusGl.push({ index, ligne: l });
  });

  const residusRgd: LigneRgd[] = [];
  for (const file of dispo.values()) residusRgd.push(...file);

  return { parIndexGl, residusGl, residusRgd };
}
