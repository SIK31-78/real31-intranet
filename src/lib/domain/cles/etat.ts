// L'etat d'un trousseau et les regles de transition : fonctions pures (ADR-040).
//
// UN SEUL FAIT STOCKE PAR VERITE : l'etat se deduit du pret ouvert, de la date de retour
// prevue, des reservations et de la marque. Une reservation « expiree » = prevue + debut
// passe. Le retard commence le lendemain de la date de retour prevue.

import type { ConformiteRetour, Entreprise, EtatTrousseau, Pret, Reservation, Trousseau, TypePret } from "./types";

const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;

/** « AAAA-MM-JJ » + n jours, en UTC (pas de fuseau sur un jour civil). */
export function plusJours(jourISO: string, jours: number): string {
  const [a, m, j] = jourISO.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j + jours)).toISOString().slice(0, 10);
}

/** Nombre de jours civils entre deux jours ISO (b - a). */
export function ecartJours(aISO: string, bISO: string): number {
  return Math.round((Date.parse(`${bISO.slice(0, 10)}T00:00:00Z`) - Date.parse(`${aISO.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

export function estJourISO(s: string): boolean {
  return JOUR_RE.test(s);
}

export function pretOuvert(p: Pret): boolean {
  return !p.renduLeISO;
}

/** Jours de retard d'un pret ouvert (0 si pas en retard, ou pret clos). */
export function joursDeRetard(p: Pret, aujourdhuiISO: string): number {
  if (!pretOuvert(p)) return 0;
  const ecart = ecartJours(p.retourPrevuLeISO, aujourdhuiISO);
  return ecart > 0 ? ecart : 0;
}

export function enRetard(p: Pret, aujourdhuiISO: string): boolean {
  return joursDeRetard(p, aujourdhuiISO) > 0;
}

/** Jours dehors : jusqu'au retour, ou jusqu'a aujourd'hui si le pret est ouvert. */
export function joursDehors(p: Pret, aujourdhuiISO: string): number {
  return ecartJours(p.sortiLeISO, p.renduLeISO ?? aujourdhuiISO);
}

/** Une reservation prevue dont le debut est passe sans sortie : expiree (jamais stockee). */
export function reservationExpiree(r: Reservation, aujourdhuiISO: string): boolean {
  return r.statut === "prevue" && r.debutISO < aujourdhuiISO;
}

/** Reservation prevue qui commence aujourd'hui ou demain : ce qui fait le badge « Réservé ». */
export function reservationImminente(r: Reservation, aujourdhuiISO: string): boolean {
  return r.statut === "prevue" && r.debutISO >= aujourdhuiISO && r.debutISO <= plusJours(aujourdhuiISO, 1);
}

/** Reservation prevue qui couvre un jour donne. */
export function reservationCouvre(r: Reservation, jourISO: string): boolean {
  return r.statut === "prevue" && r.debutISO <= jourISO && r.finPrevueISO >= jourISO;
}

/** Deux periodes [debut, fin] se chevauchent-elles ? */
export function chevauche(aDebut: string, aFin: string, bDebut: string, bFin: string): boolean {
  return aDebut <= bFin && bDebut <= aFin;
}

/** L'etat affiche du trousseau, derive. */
export function etatTrousseau(
  trousseau: Pick<Trousseau, "marque">,
  pret: Pret | null,
  reservations: Reservation[],
  aujourdhuiISO: string,
): EtatTrousseau {
  if (trousseau.marque === "retire") return "retire";
  if (trousseau.marque === "introuvable") return "introuvable";
  if (pret && pretOuvert(pret)) return enRetard(pret, aujourdhuiISO) ? "en_retard" : "sorti";
  if (reservations.some((r) => reservationImminente(r, aujourdhuiISO))) return "reserve";
  return "en_agence";
}

export interface Verdict {
  autorise: boolean;
  /** Refus metier, rendu tel quel a l'utilisateur. */
  raison?: string;
  /** Avertissement non bloquant, ou bloquant sauf confirmation (cf. `confirmable`). */
  avertissement?: string;
  /** L'avertissement peut etre leve par une confirmation explicite. */
  confirmable?: boolean;
}

const OK: Verdict = { autorise: true };

export interface ContexteSortie {
  trousseau: Pick<Trousseau, "marque" | "numero"> & Partial<Pick<Trousseau, "sensible" | "consigne">>;
  pretOuvert: Pret | null;
  reservations: Reservation[];
  entreprise: Pick<Entreprise, "id" | "nom" | "statut" | "motifBlocage"> | null;
  type: TypePret;
  /** Nom de la personne (obligatoire pour un coproprietaire). */
  contactNom?: string;
  retourPrevuLeISO: string;
  aujourdhuiISO: string;
  /** L'utilisateur a confirme l'avertissement (autre entreprise reservee, entreprise bloquee). */
  confirme?: boolean;
  /** La direction peut forcer une sortie vers une entreprise bloquee. */
  direction?: boolean;
}

/** Peut-on sortir ce trousseau ? */
export function verifierSortie(c: ContexteSortie): Verdict {
  if (c.trousseau.marque === "retire") return { autorise: false, raison: `${c.trousseau.numero} est retiré : il ne peut plus sortir.` };
  if (c.trousseau.marque === "introuvable") return { autorise: false, raison: `${c.trousseau.numero} est déclaré introuvable. Déclare-le retrouvé avant de le sortir.` };
  if (c.pretOuvert) return { autorise: false, raison: `${c.trousseau.numero} est déjà sorti${c.pretOuvert.entrepriseNom ? ` chez ${c.pretOuvert.entrepriseNom}` : ""}. Enregistre d'abord son retour.` };
  if (!estJourISO(c.retourPrevuLeISO)) return { autorise: false, raison: "Date de retour prévue illisible." };
  if (c.retourPrevuLeISO < c.aujourdhuiISO) return { autorise: false, raison: "La date de retour prévue ne peut pas être dans le passé." };
  if (c.type === "entreprise" && !c.entreprise) return { autorise: false, raison: "Choisis l'entreprise qui emporte le trousseau." };
  if (c.type !== "entreprise" && c.entreprise) return { autorise: false, raison: "Seul un prêt à une entreprise porte une entreprise." };
  if (c.type === "coproprietaire" && !c.contactNom?.trim()) return { autorise: false, raison: "Indique le nom du copropriétaire ou du membre du conseil syndical." };
  if (c.trousseau.sensible && !c.confirme) {
    return {
      autorise: false,
      avertissement: `${c.trousseau.numero} est un trousseau sensible${c.trousseau.consigne ? ` : ${c.trousseau.consigne}` : " (le conseil syndical ne souhaite pas qu'il soit remis sans accord)"}. Confirmer la sortie ?`,
      confirmable: true,
    };
  }
  if (c.entreprise?.statut === "bloquee") {
    if (!c.direction) return { autorise: false, raison: `${c.entreprise.nom} est bloquée${c.entreprise.motifBlocage ? ` (${c.entreprise.motifBlocage})` : ""} : seule la direction peut lui confier un trousseau.` };
    if (!c.confirme) return { autorise: false, avertissement: `${c.entreprise.nom} est bloquée${c.entreprise.motifBlocage ? ` (${c.entreprise.motifBlocage})` : ""}. Confirmer la sortie ?`, confirmable: true };
  }
  const autre = c.reservations.find(
    (r) => reservationCouvre(r, c.aujourdhuiISO) && (c.type !== "entreprise" || r.entrepriseId !== c.entreprise?.id),
  );
  if (autre && !c.confirme) {
    return {
      autorise: false,
      avertissement: `${c.trousseau.numero} est réservé aujourd'hui${autre.entrepriseNom ? ` par ${autre.entrepriseNom}` : ""}. Le sortir quand même ?`,
      confirmable: true,
    };
  }
  return OK;
}

export interface ContexteReservation {
  trousseau: Pick<Trousseau, "marque" | "numero">;
  pretOuvert: Pret | null;
  reservations: Reservation[];
  debutISO: string;
  finPrevueISO: string;
  aujourdhuiISO: string;
  /** Reservation en cours de modification (exclue du test de chevauchement). */
  reservationId?: string;
}

/** Peut-on reserver ce trousseau sur cette periode ? */
export function verifierReservation(c: ContexteReservation): Verdict {
  if (c.trousseau.marque === "retire") return { autorise: false, raison: `${c.trousseau.numero} est retiré.` };
  if (!estJourISO(c.debutISO) || !estJourISO(c.finPrevueISO)) return { autorise: false, raison: "Dates de réservation illisibles." };
  if (c.debutISO < c.aujourdhuiISO) return { autorise: false, raison: "Une réservation ne commence pas dans le passé." };
  if (c.finPrevueISO < c.debutISO) return { autorise: false, raison: "La fin prévue précède le début." };
  const collision = c.reservations.find(
    (r) => r.id !== c.reservationId && r.statut === "prevue" && chevauche(c.debutISO, c.finPrevueISO, r.debutISO, r.finPrevueISO),
  );
  if (collision) {
    return { autorise: false, raison: `${c.trousseau.numero} est déjà réservé du ${jjmm(collision.debutISO)} au ${jjmm(collision.finPrevueISO)}${collision.entrepriseNom ? ` par ${collision.entrepriseNom}` : ""}.` };
  }
  if (c.pretOuvert && c.pretOuvert.retourPrevuLeISO >= c.debutISO) {
    return { autorise: true, avertissement: `${c.trousseau.numero} est sorti${c.pretOuvert.entrepriseNom ? ` chez ${c.pretOuvert.entrepriseNom}` : ""}, retour prévu le ${jjmm(c.pretOuvert.retourPrevuLeISO)} : la réservation est notée, à surveiller.` };
  }
  return OK;
}

export interface ContexteRetour {
  pretOuvert: Pret | null;
  conformite: ConformiteRetour;
  commentaire?: string;
}

/** Peut-on enregistrer ce retour ? */
export function verifierRetour(c: ContexteRetour): Verdict {
  if (!c.pretOuvert) return { autorise: false, raison: "Ce trousseau n'est pas sorti : rien à rendre." };
  if (c.conformite !== "complet" && !c.commentaire?.trim()) return { autorise: false, raison: "Un retour incomplet ou endommagé demande un commentaire." };
  return OK;
}

function jjmm(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

/** Duree lisible d'un pret : « le jour même », « 3 j », « 2 mois ». */
export function libelleDuree(jours: number): string {
  if (jours <= 0) return "le jour même";
  if (jours === 1) return "1 jour";
  if (jours < 60) return `${jours} jours`;
  const mois = Math.round(jours / 30);
  return `${mois} mois`;
}
