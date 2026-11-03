// Brouillon d'un recap d'AG (REA-98) : la saisie en cours est gardee dans le navigateur,
// copro par copro, pour qu'une fermeture d'onglet ou une coupure ne fasse rien perdre.
// Choix volontaire : stockage LOCAL (aucune table, aucun SQL). Le brouillon ne suit donc
// pas la personne d'un poste a l'autre ; c'est un filet, pas un document partage.
// Ce module ne connait pas `localStorage` : il produit et relit le texte stocke.

export interface TravauxBrouillon {
  numeroResolution: string;
  libelle: string;
  budget: string;
  cleRepartition: string;
  modalitesAppelFonds: string;
}

/** Tout ce que le formulaire saisit, tel quel (texte des champs, choix Oui/Non). */
export interface SaisieRecapAg {
  jour: string;
  debut: string;
  fin: string;
  comptesApprouves: boolean | null;
  reserves: string;
  budgetModifie: boolean | null;
  montantBudget: string;
  pourcentageBudget: string;
  pptVote: boolean | null;
  pourcentagePpt: string;
  montantPpt: string;
  fondsTravaux: boolean | null;
  infoComptable: string;
  travaux: TravauxBrouillon[];
  debutContrat: string;
  finContrat: string;
  honoraires: string;
  forfaitPostaux: string;
  fraisPostauxReels: boolean | null;
}

export interface BrouillonRecapAg {
  coproCode: string;
  /** ISO, moment de la derniere sauvegarde. */
  enregistreLe: string;
  saisie: SaisieRecapAg;
}

const VERSION = 1;
/** Au-dela, un brouillon oublie ne doit plus resurgir sur un recap sans rapport. */
export const DUREE_VIE_BROUILLON_JOURS = 30;

export function cleBrouillon(coproCode: string): string {
  return `recap-ag:brouillon:v${VERSION}:${coproCode}`;
}

export function serialiserBrouillon(coproCode: string, saisie: SaisieRecapAg, maintenant: Date): string {
  const b: BrouillonRecapAg = { coproCode, enregistreLe: maintenant.toISOString(), saisie };
  return JSON.stringify(b);
}

const estBoolOuNull = (v: unknown) => v === null || typeof v === "boolean";
const CHAMPS_TEXTE = [
  "jour", "debut", "fin", "reserves", "montantBudget", "pourcentageBudget", "pourcentagePpt",
  "montantPpt", "infoComptable", "debutContrat", "finContrat", "honoraires", "forfaitPostaux",
] as const;
const CHAMPS_CHOIX = ["comptesApprouves", "budgetModifie", "pptVote", "fondsTravaux", "fraisPostauxReels"] as const;
const CHAMPS_TRAVAUX = ["numeroResolution", "libelle", "budget", "cleRepartition", "modalitesAppelFonds"] as const;

/**
 * Relit un brouillon stocke. Rend null s'il est illisible, d'une autre copro, perime,
 * ou s'il ne contient aucune saisie (rien a proposer de reprendre).
 */
export function lireBrouillon(texte: string | null, coproCode: string, maintenant: Date): BrouillonRecapAg | null {
  if (!texte) return null;
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return null;
  }
  if (!brut || typeof brut !== "object") return null;
  const b = brut as Partial<BrouillonRecapAg>;
  if (b.coproCode !== coproCode || typeof b.enregistreLe !== "string") return null;
  const date = new Date(b.enregistreLe);
  if (Number.isNaN(date.getTime())) return null;
  if (maintenant.getTime() - date.getTime() > DUREE_VIE_BROUILLON_JOURS * 86_400_000) return null;

  const s = b.saisie as Record<string, unknown> | undefined;
  if (!s || typeof s !== "object") return null;
  if (!CHAMPS_TEXTE.every((k) => typeof s[k] === "string")) return null;
  if (!CHAMPS_CHOIX.every((k) => estBoolOuNull(s[k]))) return null;
  if (!Array.isArray(s.travaux)) return null;
  const travauxOk = s.travaux.every(
    (t) => t && typeof t === "object" && CHAMPS_TRAVAUX.every((k) => typeof (t as Record<string, unknown>)[k] === "string"),
  );
  if (!travauxOk) return null;

  return { coproCode, enregistreLe: b.enregistreLe, saisie: s as unknown as SaisieRecapAg };
}

/**
 * La saisie differe-t-elle du formulaire tel qu'il s'ouvre ? Sert a ne pas stocker (ni
 * proposer de reprendre) un formulaire qu'on n'a pas touche.
 */
export function saisieModifiee(saisie: SaisieRecapAg, ouverture: SaisieRecapAg): boolean {
  return JSON.stringify(saisie) !== JSON.stringify(ouverture);
}
