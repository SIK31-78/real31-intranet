// Service : frais postaux AU REEL des copros ESTALE, mois par mois (REA-490). Lecture
// seule : rien n'est ecrit, ni dans Pennylane ni dans ESTALE.
//
// Une periode = une facture ESTALE (decision Sekou du 03/11/2026) : on refacture ce que
// REAL31 a reellement paye, et une facture ESTALE ne se refacture qu'une fois.

import { getConsommationEstaleProvider, getFacturationRepository } from "@/lib/adapters/router";
import {
  codeCoproDuDetail,
  regrouperFraisPostaux,
  type FraisPostauxPeriode,
} from "@/lib/domain/facturation/frais-postaux-reels";
import type { FactureEstaleRecue } from "@/lib/ports/consommation-estale-provider";

export interface ApercuFraisPostaux {
  /** Factures ESTALE disponibles, la plus recente d'abord. */
  factures: FactureEstaleRecue[];
  /** Facture affichee ; null s'il n'y en a aucune. */
  reference: string | null;
  periode: FraisPostauxPeriode;
  /**
   * Copros au reel a la date de la facture, parmi celles qu'elle nomme ou qui ont un
   * mailing ESTALE (une copro au reel sans aucun envoi peut donc manquer).
   */
  coprosAuReel: string[];
}

/** Dernier jour du mois d'une date ISO "YYYY-MM-DD". */
function finDeMois(dateISO: string): string {
  const [a, m] = dateISO.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(a, m, 0));
  return d.toISOString().slice(0, 10);
}

export async function apercuFraisPostaux(reference?: string): Promise<ApercuFraisPostaux> {
  const estale = getConsommationEstaleProvider();
  const factures = await estale.listerFactures();
  const facture = (reference ? factures.find((f) => f.reference === reference) : factures[0]) ?? null;
  if (!facture) return { factures, reference: null, periode: { parCopro: [], nonRattaches: [] }, coprosAuReel: [] };

  const [lignes, mailings] = await Promise.all([
    estale.lireConsommation(facture.reference),
    estale.coprosDesMailings(),
  ]);

  // Copros concernees par la facture : celles nommees dans le detail et celles des mailings.
  const codes = new Set<string>();
  for (const l of lignes) {
    const c = codeCoproDuDetail(l.detail);
    if (c) codes.add(c);
  }
  for (const liste of mailings.values()) for (const c of liste) codes.add(c);

  // Regime du contrat EN VIGUEUR le mois de la facture : le dernier cycle commence avant
  // la fin du mois (S307 passe au reel le 01/10/2026, pas avant).
  const fin = finDeMois(facture.dateISO);
  const repo = getFacturationRepository();
  const auReel: string[] = [];
  await Promise.all(
    [...codes].map(async (code) => {
      const cycles = await repo.listerCyclesContrat(code);
      const enVigueur = cycles
        .filter((c) => c.debutContrat <= fin)
        .sort((a, b) => b.debutContrat.localeCompare(a.debutContrat))[0];
      if (enVigueur?.fraisPostauxReels) auReel.push(code);
    }),
  );
  auReel.sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));

  return {
    factures,
    reference: facture.reference,
    periode: regrouperFraisPostaux(lignes, new Set(auReel), mailings),
    coprosAuReel: auReel,
  };
}
