// Logique PURE de fusion du referentiel copro (ADR-001) : zero I/O, zero dependance
// technique -> testable offline. Deux sources se rejoignent ici :
//
//  - le MIROIR (public."Copropriete") : les 261 Crypto + quelques copros eStale
//    "mirrorees" (dataSource=ESTALE). Deja cloisonne au niveau REQUETE SQL (managerId).
//  - le PROVIDER eSTALE live : les copros REAL31 lues en direct sur l'API eStale
//    (identite, agence, equipe). eStale N'A PAS les dates d'AG/CS planifiees : aucune
//    AG n'y est encore tenue. Ces dates viennent de la table intranet_copro_dates,
//    avec REPLI sur la ligne miroir (pour ne rien perdre des copros deja mirrorees).
//
// La cle de RAPPROCHEMENT entre les deux mondes est la reference NORMALISEE : le miroir
// stocke deja "S300" / "SE999" (sans zeros), l'API eStale renvoie "S0300". Une copro
// eStale vient TOUJOURS d'eStale, jamais en double avec sa ligne miroir.

import type { Copropriete } from "@/lib/domain/copropriete";
import { heureDe } from "@/lib/domain/reunion";

/** "S0299" / "s299 " -> "S299" : prefixe lettre(s) + numero sans zeros de tete. */
export function normaliserRef(ref: string): string {
  const m = ref.trim().toUpperCase().match(/^([A-Z]+)0*(\d+)$/);
  return m ? `${m[1]}${m[2]}` : ref.trim().toUpperCase();
}

/** Dates d'AG/CS d'une copro eStale (portees par intranet_copro_dates, jamais par eStale).
 *  Decomposees en jour + heure pour reconstruire proprement ProchaineAg / la CS. */
export interface CoproDates {
  /** Prochaine AG, jour "YYYY-MM-DD". */
  prochaineAgDate?: string;
  /** Heure "HH:mm" de la prochaine AG (absente = journee entiere). */
  prochaineAgHeure?: string;
  prochaineCsDate?: string;
  prochaineCsHeure?: string;
  /** Derniere AG tenue, jour "YYYY-MM-DD". */
  derniereAgDate?: string;
  derniereCsDate?: string;
}

/** CoproDates depuis les timestamps bruts de la table intranet (next_* = timestamptz avec
 *  heure ; last_* = date pure). Le jour est lu DEPUIS LA CHAINE (pas via `new Date`) pour
 *  eviter tout decalage de fuseau a minuit. */
export function datesDepuisTimestamps(row: {
  next_ag_date?: string | null;
  next_cs_date?: string | null;
  last_ag_date?: string | null;
  last_cs_date?: string | null;
}): CoproDates {
  const heure = (iso: string | null | undefined) => heureDe(iso ?? undefined);
  return {
    ...(row.next_ag_date
      ? { prochaineAgDate: row.next_ag_date.slice(0, 10), ...(heure(row.next_ag_date) ? { prochaineAgHeure: heure(row.next_ag_date) } : {}) }
      : {}),
    ...(row.next_cs_date
      ? { prochaineCsDate: row.next_cs_date.slice(0, 10), ...(heure(row.next_cs_date) ? { prochaineCsHeure: heure(row.next_cs_date) } : {}) }
      : {}),
    ...(row.last_ag_date ? { derniereAgDate: row.last_ag_date.slice(0, 10) } : {}),
    ...(row.last_cs_date ? { derniereCsDate: row.last_cs_date.slice(0, 10) } : {}),
  };
}

/** CoproDates portees par une ligne miroir (repli quand la table intranet est vide). */
export function datesDuMiroir(copro: Copropriete | null | undefined): CoproDates {
  if (!copro) return {};
  return {
    ...(copro.prochaineAg
      ? { prochaineAgDate: copro.prochaineAg.date, ...(copro.prochaineAg.heure ? { prochaineAgHeure: copro.prochaineAg.heure } : {}) }
      : {}),
    ...(copro.prochaineCsDate
      ? { prochaineCsDate: copro.prochaineCsDate, ...(copro.prochaineCsHeure ? { prochaineCsHeure: copro.prochaineCsHeure } : {}) }
      : {}),
    ...(copro.derniereAgDate ? { derniereAgDate: copro.derniereAgDate } : {}),
    ...(copro.derniereCsDate ? { derniereCsDate: copro.derniereCsDate } : {}),
  };
}

/** Fusionne dates intranet (PRIORITAIRES) et dates miroir (REPLI). La prochaine AG /
 *  CS bascule en bloc (jour + heure ensemble) : si intranet porte le jour, on prend
 *  aussi son heure ; sinon le miroir. Les "dernieres" (tenues) sont independantes. */
export function fusionnerDates(
  intranet: CoproDates | null | undefined,
  miroir: CoproDates | null | undefined,
): CoproDates {
  const i = intranet ?? {};
  const m = miroir ?? {};
  const ag = i.prochaineAgDate ? i : m;
  const cs = i.prochaineCsDate ? i : m;
  const derniereAg = i.derniereAgDate ?? m.derniereAgDate;
  const derniereCs = i.derniereCsDate ?? m.derniereCsDate;
  return {
    ...(ag.prochaineAgDate
      ? { prochaineAgDate: ag.prochaineAgDate, ...(ag.prochaineAgHeure ? { prochaineAgHeure: ag.prochaineAgHeure } : {}) }
      : {}),
    ...(cs.prochaineCsDate
      ? { prochaineCsDate: cs.prochaineCsDate, ...(cs.prochaineCsHeure ? { prochaineCsHeure: cs.prochaineCsHeure } : {}) }
      : {}),
    ...(derniereAg ? { derniereAgDate: derniereAg } : {}),
    ...(derniereCs ? { derniereCsDate: derniereCs } : {}),
  };
}

/** Applique un jeu de CoproDates a une copro eStale (identite/equipe/agence sans dates).
 *  Reconstruit ProchaineAg avec le meme supervisionId (`CODE__DATE`) que le miroir. */
export function appliquerDates(copro: Copropriete, dates: CoproDates): Copropriete {
  return {
    ...copro,
    ...(dates.prochaineAgDate
      ? {
          prochaineAg: {
            date: dates.prochaineAgDate,
            ...(dates.prochaineAgHeure ? { heure: dates.prochaineAgHeure } : {}),
            statut: "planifiee" as const,
            supervisionId: `${copro.code}__${dates.prochaineAgDate}`,
          },
        }
      : {}),
    ...(dates.derniereAgDate ? { derniereAgDate: dates.derniereAgDate } : {}),
    ...(dates.prochaineCsDate ? { prochaineCsDate: dates.prochaineCsDate } : {}),
    ...(dates.prochaineCsDate && dates.prochaineCsHeure ? { prochaineCsHeure: dates.prochaineCsHeure } : {}),
    ...(dates.derniereCsDate ? { derniereCsDate: dates.derniereCsDate } : {}),
  };
}

/**
 * Union du miroir Crypto et des copros eStale live.
 *  - `crypto` : copros du miroir DEJA cloisonnees (list(managerId)). On en retire les
 *    lignes de source eStale (dataSource=ESTALE) ET toute ligne dont la reference
 *    normalisee correspond a une copro eStale : la version eStale fait foi.
 *  - `estale` : copros eStale (dates deja appliquees). Cloisonnees EN CODE ici (le
 *    miroir l'a fait en SQL) : on garde celles dont le gestionnaire OU l'assistant
 *    resolu est le scope. Sans scope (vue transverse) : toutes.
 */
export function fusionnerCopros(params: {
  crypto: Copropriete[];
  estale: Copropriete[];
  managerId?: string;
}): Copropriete[] {
  const { crypto, estale, managerId } = params;
  const refsEstale = new Set(estale.map((c) => normaliserRef(c.code)));
  const cryptoGardees = crypto.filter(
    (c) => c.source !== "estale" && !refsEstale.has(normaliserRef(c.code)),
  );
  const estaleScoped = managerId
    ? estale.filter((c) => c.managerId === managerId || c.assistantId === managerId)
    : estale;
  return [...cryptoGardees, ...estaleScoped].filter((c) => c.statut === "active");
}
