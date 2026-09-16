// L'ELECTION : une proposition elue devient une copropriete du cabinet (ADR-039, brique 3).
// Sur un bouton, jamais au simple changement de statut (Sekou, 16/09/2026) : le
// gestionnaire relit ce qui va etre cree, et rien ne part chez Pennylane sans lui.
//
// Ce qui se cree, dans l'ordre : la fiche App A (le referentiel que toute l'application
// filtre), le cycle de contrat (ce que la facturation lit), le client Pennylane (ce que la
// facture vise), le dossier de reprise (la checklist d'equipe). Fonctions pures ici ; le
// service orchestre.

import { finDeCycle } from "@/lib/domain/contrat/cycle-contrat";
import { normaliser } from "./rapprochement";
import { adressePourContrat } from "./offre";
import type { Proposition } from "./proposition";

/**
 * Le prochain code SXXX libre. Les codes du cabinet sont « S » + trois chiffres, en
 * sequence ; on regarde toutes les sources (App A ET eStale : les reprises S303-S306
 * n'existent qu'a eStale) et on prend le plus grand + 1. SE999 / T999 / SV09 sont ignores.
 */
export function prochainCodeCopro(codesExistants: string[]): string {
  let max = 0;
  for (const c of codesExistants) {
    const m = c.trim().toUpperCase().match(/^S0?(\d{3})$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `S${String(max + 1).padStart(3, "0")}`;
}

/**
 * Le nom court propose pour la fiche : la voie en capitales sans accent + le numero, a la
 * maniere des codes existants (SEBASTOPOL16, BARRILLET1, FOCH44LGC). Le registre donne
 * parfois un nom d'usage, sinon on le fabrique.
 */
export function nomUsuelPropose(p: Proposition): string {
  const a = p.immeuble.adresse;
  const m = a.match(/^\s*([\d\s\/,\-–]*\d(?:\s*(?:bis|ter|b|t)\b)?)?\s*(.*)$/i);
  const numero = (m?.[1] ?? "").replace(/[\s,]+/g, "").replace(/[\/\-–]+/g, "-").toUpperCase();
  const voie = normaliser((m?.[2] ?? a).split(/\s[-–]\s/)[0] ?? "")
    .split(" ")
    .filter((w) => w && !["rue", "r", "av", "ave", "avenue", "bd", "bld", "boulevard", "pl", "place", "all", "allee", "imp", "impasse", "ch", "chemin", "sq", "square", "res", "residence", "villa", "passage", "route", "quai", "de", "des", "du", "d", "la", "le", "les", "l", "et"].includes(w));
  const mot = voie[voie.length - 1] ?? voie[0] ?? "COPRO";
  return `${mot.toUpperCase()}${numero}`.slice(0, 20);
}

/** Ce que le gestionnaire choisit au moment de creer. */
export interface ChoixElection {
  code: string;
  nomUsuel: string;
  /** Debut du contrat = prise en gestion. */
  debutISO: string;
  finISO?: string;
  dureeMois?: number;
  agenceId?: string;
  managerId?: string;
  creerClientPennylane: boolean;
  ouvrirDossierReprise: boolean;
}

/** La copropriete telle qu'elle entre dans le referentiel. */
export interface NouvelleCopro {
  code: string;
  nom: string;
  adresse1: string;
  codePostal: string;
  ville: string;
  immatriculation?: string;
  lotsPrincipaux: number;
  lotsAutres: number;
  agenceId?: string;
  managerId?: string;
  priseEnGestionISO: string;
  finMandatISO: string;
  /** Prochaine AG connue (celle qui a elu, si elle est a venir). */
  prochaineAgISO?: string;
  dureeAgHeures: number;
  finMaxAgHeure: number;
  nbCs: number;
  dureeCsHeures: number;
  nbVisites: number;
  fraisPostauxReels: boolean;
  /** Reference externe Pennylane (UUID), posee quand le client est cree. */
  pennylaneId?: string;
  /** « SDC 16 rue Sébastopol - S303 » : le nom du client Pennylane. */
  nomSdc: string;
}

export interface ObstacleElection {
  champ: string;
  message: string;
}

export function obstaclesElection(p: Proposition, choix: Pick<ChoixElection, "code" | "nomUsuel" | "debutISO">, codesExistants: string[]): string[] {
  const m: string[] = [];
  if (!/^S\d{3}$/i.test(choix.code.trim())) m.push("le code doit être S suivi de trois chiffres (S303)");
  else if (codesExistants.some((c) => c.trim().toUpperCase() === choix.code.trim().toUpperCase())) m.push(`le code ${choix.code.toUpperCase()} existe déjà`);
  if (!choix.nomUsuel.trim()) m.push("le nom court de la copropriété");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(choix.debutISO)) m.push("la date de prise en gestion");
  if (!p.immeuble.lotsPrincipaux) m.push("le nombre de lots principaux");
  if (p.prix.honorairesTtc === undefined) m.push("les honoraires retenus");
  if (!p.immeuble.codePostal?.trim() || !p.immeuble.commune?.trim()) m.push("le code postal et la commune");
  return m;
}

export function coproDepuisElection(p: Proposition, choix: ChoixElection, inclus: { dureeAgHeures: number; finMaxAgHeure: number; nbCs: number; dureeCsHeures: number; nbVisites: number }): NouvelleCopro {
  const code = choix.code.trim().toUpperCase();
  const finISO = choix.finISO ?? finDeCycle(choix.debutISO, choix.dureeMois ?? 12);
  const ag = p.agPrevueISO ?? p.immeuble.prochaineAgISO;
  // Sans le suffixe « - Courbevoie » de l'Excel : la commune a sa colonne.
  const adresse = adressePourContrat(p.immeuble.adresse, p.immeuble.commune);
  return {
    code,
    nom: choix.nomUsuel.trim(),
    adresse1: adresse,
    codePostal: p.immeuble.codePostal?.trim() ?? "",
    ville: p.immeuble.commune?.trim() ?? "",
    ...(p.immeuble.immatriculation ? { immatriculation: p.immeuble.immatriculation } : {}),
    lotsPrincipaux: p.immeuble.lotsPrincipaux ?? 0,
    lotsAutres: p.immeuble.lotsStationnement ?? 0,
    ...(choix.agenceId ? { agenceId: choix.agenceId } : {}),
    ...(choix.managerId ? { managerId: choix.managerId } : {}),
    priseEnGestionISO: choix.debutISO,
    finMandatISO: finISO,
    ...(ag && ag > choix.debutISO ? { prochaineAgISO: ag } : {}),
    dureeAgHeures: inclus.dureeAgHeures,
    finMaxAgHeure: inclus.finMaxAgHeure,
    nbCs: p.immeuble.csPrevus ?? inclus.nbCs,
    dureeCsHeures: inclus.dureeCsHeures,
    nbVisites: p.immeuble.visitesPrevues ?? inclus.nbVisites,
    fraisPostauxReels: p.prix.fraisPostauxReels ?? true,
    nomSdc: `SDC ${adresse} - ${code}`,
  };
}
