// Perimetre d'un COMPTABLE : les agences dont il tient la comptabilite (Sekou 2026-07-29).
//
// POURQUOI ce module existe. Un comptable n'a pas de PORTEFEUILLE au sens gestionnaire
// (aucune copro ne porte son id comme managerId) -> tous les ecrans qui scopent par
// `managerId` lui renvoyaient une liste VIDE : il ne pouvait pas facturer, alors que c'est
// precisement son metier. Et l'ouvrir a TOUTES les copros serait faux : chaque comptable
// tient des agences precises.
//
// POURQUOI PAS `User.agencyId`. La table ne porte qu'UNE agence de rattachement, or Romain
// et Elsa tiennent TROIS agences (HLS, LGC, ASN) : le champ ne peut pas exprimer le
// perimetre reel. Isabelle, elle, tient les copros de Maisons-Laffitte (ML).
//
// POURQUOI ICI et pas dans une variable d'environnement. Les allowlists d'env (COMPTABLES,
// MAIL_PILOTES...) sont pratiques mais invisibles et non testables : deux incidents le
// 2026-07-28 sont venus d'une variable qu'on croyait posee. Ce perimetre est une donnee
// CABINET stable, elle merite d'etre lisible, testee et versionnee - meme parti que la liste
// fermee des salles de reunion (domain/salles-reunion.ts). A deplacer en base le jour ou les
// affectations bougeront souvent.

import { delegationActive, type Delegation } from "./perimetre-ecriture";

/** Codes d'agence REAL31, alignes sur public."Agency".name. */
export type CodeAgence = "ML" | "LGC" | "HLS" | "ASN";

const CODES_AGENCE: readonly CodeAgence[] = ["ML", "LGC", "HLS", "ASN"];

function codeAgenceConnu(code: string | null | undefined): CodeAgence | null {
  const c = (code ?? "").trim().toUpperCase();
  return (CODES_AGENCE as readonly string[]).includes(c) ? (c as CodeAgence) : null;
}

/** Affectation d'un comptable aux agences dont il tient la compta. */
interface AffectationComptable {
  email: string;
  agences: readonly CodeAgence[];
}

// Liste FERMEE. Un email absent = aucun perimetre agence (le comptable ne verra rien de
// plus qu'avant) : on n'ouvre JAMAIS tout par defaut.
const AFFECTATIONS: readonly AffectationComptable[] = [
  { email: "isabelle.anglade@real31.fr", agences: ["ML"] },
  { email: "romain.gobert@real31.fr", agences: ["HLS", "LGC", "ASN"] },
  { email: "elsa.peixoto@real31.fr", agences: ["HLS", "LGC", "ASN"] },
];

/**
 * Agences dont ce comptable tient la comptabilite. `[]` si l'email n'est pas affecte
 * (comparaison insensible a la casse : l'email Entra peut differer de la table).
 */
export function agencesDuComptable(email: string | null | undefined): CodeAgence[] {
  const cible = (email ?? "").trim().toLowerCase();
  if (!cible) return [];
  return [...(AFFECTATIONS.find((a) => a.email === cible)?.agences ?? [])];
}

/** Les comptables qui tiennent cette agence (emails), pour leur ecrire. [] si agence inconnue. */
export function comptablesPourAgence(codeAgence: string | null | undefined): string[] {
  if (!codeAgence) return [];
  return AFFECTATIONS.filter((a) => (a.agences as readonly string[]).includes(codeAgence)).map((a) => a.email);
}

/** Ce comptable a-t-il un perimetre agence declare ? */
export function aUnPerimetreComptable(email: string | null | undefined): boolean {
  return agencesDuComptable(email).length > 0;
}

/** Le perimetre comptable d'une personne, delegations comprises (REA-158). */
export interface PerimetreComptableEtendu {
  /** Toutes les agences tenues, dans l'ordre ML, LGC, HLS, ASN. */
  agences: CodeAgence[];
  /** Celles qui ne viennent QUE d'une delegation active (a signaler a l'ecran). */
  parDelegation: CodeAgence[];
}

/**
 * Agences comptables de cette personne, ELARGIES par ses delegations ACTIVES (REA-158,
 * decision Sekou : une comptable reprend l'agence d'une collegue pendant ses conges par
 * une delegation DATEE, pas en touchant la liste fermee ci-dessus).
 *
 * Deux portees elargissent le perimetre COMPTABLE :
 *   - « agence » : l'agence deleguee ;
 *   - « portefeuille » d'une COMPTABLE : ses agences (une comptable n'a pas de portefeuille
 *     de copros, son « portefeuille » est son perimetre agence) - Romain confie le sien a
 *     Isabelle pour ses conges. Le portefeuille d'un GESTIONNAIRE, lui, ne donne aucune
 *     agence : il s'ouvre copro par copro, par le perimetre d'ecriture (ADR-041).
 * La portee « copro » n'ouvre pas d'agence (meme raison).
 *
 * `emailDe` : l'email d'un titulaire, que l'appelant resout. Delegation expiree ou a venir :
 * ignoree. Pur, sans horloge.
 *
 * SECURITE : le portefeuille d'une comptable ne s'ouvre qu'a une BENEFICIAIRE COMPTABLE
 * (`beneficiaireComptable`, par defaut : une agence a elle dans la liste fermee). Sans ce
 * verrou, un directeur d'agence pouvait se deleguer a lui-meme le portefeuille de la
 * comptable rattachee a son agence (peutDeleguer l'y autorise) et recuperer l'ecriture sur
 * TOUTES les agences qu'elle tient, bien au-dela de la sienne (coproAppartient).
 */
export function perimetreComptableEtendu(
  email: string | null | undefined,
  delegations: readonly Delegation[],
  emailDe: (userId: string) => string | null | undefined,
  aujourdHuiISO: string,
  beneficiaireComptable?: boolean,
): PerimetreComptableEtendu {
  const propres = new Set<CodeAgence>(agencesDuComptable(email));
  const comptable = beneficiaireComptable ?? propres.size > 0;
  const deleguees = new Set<CodeAgence>();
  for (const d of delegations) {
    if (!delegationActive(d, aujourdHuiISO)) continue;
    if (d.portee === "agence") {
      const code = codeAgenceConnu(d.agenceCode);
      if (code) deleguees.add(code);
    } else if (d.portee === "portefeuille" && comptable) {
      for (const code of agencesDuComptable(emailDe(d.deUserId))) deleguees.add(code);
    }
  }
  const toutes = new Set<CodeAgence>([...propres, ...deleguees]);
  return {
    agences: CODES_AGENCE.filter((c) => toutes.has(c)),
    parDelegation: CODES_AGENCE.filter((c) => deleguees.has(c) && !propres.has(c)),
  };
}

/** Filtre des copros sur une liste d'agences donnee (vide -> liste VIDE, jamais tout). */
export function filtrerSurAgences<T>(
  copros: readonly T[],
  agences: readonly string[],
  codeAgenceDe: (copro: T) => string | null | undefined,
): T[] {
  const retenues = new Set<string>(agences);
  if (retenues.size === 0) return [];
  return copros.filter((c) => {
    const code = codeAgenceDe(c);
    return Boolean(code) && retenues.has(code as string);
  });
}

/**
 * Filtre des copros sur le perimetre du comptable. `codeAgenceDe` resout le code d'agence
 * d'une copro (l'appelant le sait : la copro porte un `agenceId` technique, la resolution
 * id -> code passe par la table Agency).
 *
 * Sans perimetre declare -> liste VIDE, jamais la liste complete : ouvrir tout par defaut
 * serait la pire des degradations (un comptable facturerait des copros qui ne sont pas les
 * siennes). Mieux vaut un ecran vide, qui se voit et se signale.
 */
export function filtrerSurPerimetreComptable<T>(
  copros: readonly T[],
  email: string | null | undefined,
  codeAgenceDe: (copro: T) => string | null | undefined,
): T[] {
  return filtrerSurAgences(copros, agencesDuComptable(email), codeAgenceDe);
}
