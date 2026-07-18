// Normalisation de la sortie brute du modele (JSON du grand livre) -> domaine JeuEcritures.
// PUR (aucun reseau) : couche testable PARTAGEE par les adapters d'extraction compta
// (Claude, CLI, Mistral). C'est la premiere ligne de defense DETERMINISTE : elle force les
// invariants du domaine (montant positif, date ISO, classe deduite) et ECARTE defensivement
// les lignes inexploitables (compte vide, montant nul, sens indetermine, compte hors 1-7) en
// laissant une NOTE de vigilance. La verification des VALEURS (equilibre) reste a l'auto-check.

import { z } from "zod";
import { classeDe, type ClasseComptable } from "@/lib/reprise/domain/compta";
import type { JeuEcritures, LigneEcriture, SensEcriture } from "@/lib/reprise/domain/ecriture";

const optStr = z.coerce.string().trim().optional();

const LigneBrute = z.object({
  date: z.coerce.string().default(""),
  compte: z.coerce.string().default(""),
  libelle: z.coerce.string().default(""),
  sens: z.coerce.string().default(""),
  montant: z.coerce.number().default(0),
  piece: optStr,
});

const GrandLivreBrut = z.object({
  lignes: z.array(LigneBrute).default([]),
  notes: z.array(z.coerce.string()).default([]),
});

/** Arrondi au centime (evite le bruit flottant sur les montants). */
function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Normalise une date vers ISO AAAA-MM-JJ. Gere le deja-ISO (on garde la partie date) et le
 * format francais JJ/MM/AAAA (separateurs / . -). Format inconnu : renvoye tel quel, le
 * verificateur aval le signalera plutot que d'inventer une date.
 */
function normaliserDateISO(brut: string): string {
  const s = brut.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const fr = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (fr) {
    const jj = fr[1].padStart(2, "0");
    const mm = fr[2].padStart(2, "0");
    let aaaa = fr[3];
    if (aaaa.length === 2) aaaa = Number(aaaa) >= 70 ? `19${aaaa}` : `20${aaaa}`;
    return `${aaaa}-${mm}-${jj}`;
  }
  return s;
}

/**
 * Deduit le sens depuis la valeur brute du modele. Tolerant : "debit"/"credit", mais aussi
 * "D"/"C" (initiales frequentes dans les grands livres). Indetermine -> null (ligne ecartee).
 */
function normaliserSens(brut: string): SensEcriture | null {
  const s = brut.trim().toLowerCase();
  if (s.startsWith("d")) return "debit";
  if (s.startsWith("c")) return "credit";
  return null;
}

export function normaliserGrandLivre(brut: unknown): JeuEcritures {
  const gl = GrandLivreBrut.parse(brut);
  const lignes: LigneEcriture[] = [];
  const notes = [...gl.notes];

  let nbVideOuNul = 0;
  let nbSensIndetermine = 0;
  let nbHorsClasse = 0;

  for (const l of gl.lignes) {
    const compte = l.compte.trim();
    const montant = arrondi(Math.abs(l.montant)); // invariant domaine : montant > 0
    if (!compte || montant === 0) {
      nbVideOuNul++;
      continue;
    }
    const sens = normaliserSens(l.sens);
    if (!sens) {
      nbSensIndetermine++;
      continue;
    }
    let classe: ClasseComptable;
    try {
      classe = classeDe(compte); // leve si le compte n'est pas en classe 1..7
    } catch {
      nbHorsClasse++;
      continue;
    }
    lignes.push({
      date: normaliserDateISO(l.date),
      compte,
      libelle: l.libelle.trim(),
      sens,
      montant,
      classe,
      piece: l.piece && l.piece.trim() ? l.piece.trim() : undefined,
    });
  }

  if (nbVideOuNul) notes.push(`${nbVideOuNul} ligne(s) ecartee(s) : compte vide ou montant nul.`);
  if (nbSensIndetermine) notes.push(`${nbSensIndetermine} ligne(s) ecartee(s) : sens debit/credit indetermine.`);
  if (nbHorsClasse) notes.push(`${nbHorsClasse} ligne(s) ecartee(s) : compte hors classes comptables 1-7.`);

  return { lignes, notes };
}
