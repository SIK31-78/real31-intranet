// Service de VERIFICATION de la balance comptable d'une copro (increment 0, lecture seule).
// Compose le port de lecture eStale et le domaine :
//   1. resout le CODE copro -> exercice comptable courant (RefAccounting) ;
//   2. lit les comptes de l'exercice, construit la balance par classe (construireBalance) ;
//   3. rapproche la balance calculee de Accounting.balance d'eStale (coherence).
//
// C'est la brique qui permettra plus tard de verifier "la balance tombe a 0 apres reprise".
// Ici, on se contente de MESURER. Degrade proprement : copro introuvable ou eStale indispo
// => { ok:false, message } (jamais d'exception qui remonte a l'appelant).
//
// Hexagonal : parle UNIQUEMENT au port EstaleComptaLectureProvider. Le provider (reel ou
// mock) est injecte par le routeur (getEstaleComptaLectureProvider()).

import { construireBalance, SEUIL_EQUILIBRE, type BalanceReprise } from "@/lib/reprise/domain/compta";
import type { EstaleComptaLectureProvider } from "@/lib/reprise/ports/estale-compta-lecture-provider";
import { getEstaleComptaLectureProvider } from "@/lib/reprise/adapters/router";

/** Ecart tolere entre la balance eStale et notre ecart calcule pour les juger coherents. */
const SEUIL_COHERENCE = 0.01;

export interface ResultatBalanceOk {
  ok: true;
  /** Balance par classe + totaux + verdict d'equilibre (calcul maison). */
  balance: BalanceReprise;
  /** Accounting.balance lu dans eStale (le solde global de l'exercice cote eStale). */
  balanceGlobaleEstale: number;
  /**
   * true si eStale et notre calcul s'accordent sur l'equilibre : soit les deux "tombent a 0"
   * (|ecart| et |balanceGlobaleEstale| < seuil), soit les deux annoncent le meme desequilibre.
   * Un false signale un ecart de perimetre a investiguer (comptes archives, classes hors 1..7...).
   */
  coherent: boolean;
}

export interface ResultatBalanceErreur {
  ok: false;
  message: string;
}

export type ResultatBalance = ResultatBalanceOk | ResultatBalanceErreur;

/**
 * Verifie la balance comptable d'une copro. `provider` injectable pour les tests ; par
 * defaut, le routeur choisit reel (si eStale configure) ou mock.
 */
export async function verifierBalanceCompta(
  coproCode: string,
  provider: EstaleComptaLectureProvider = getEstaleComptaLectureProvider(),
): Promise<ResultatBalance> {
  try {
    const ref = await provider.resoudreAccounting(coproCode);
    if (!ref) {
      return { ok: false, message: `Copro "${coproCode}" introuvable dans eStale ou sans exercice comptable ouvert.` };
    }

    const [comptes, balanceGlobaleEstale] = await Promise.all([
      provider.lireComptes(ref),
      provider.lireBalanceGlobale(ref),
    ]);

    const balance = construireBalance(comptes);

    // Coherence : eStale et nous devons nous accorder sur "equilibre ou pas". On ne compare
    // pas les valeurs brutes (la semantique exacte de Accounting.balance cote eStale n'est
    // pas totalement certaine, cf. etude) mais le VERDICT d'equilibre des deux sources.
    const estaleEquilibre = Math.abs(balanceGlobaleEstale) < SEUIL_COHERENCE;
    const coherent = balance.equilibre === estaleEquilibre;

    return { ok: true, balance, balanceGlobaleEstale, coherent };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Lecture comptable eStale impossible pour "${coproCode}" : ${message}` };
  }
}

export { SEUIL_EQUILIBRE };
